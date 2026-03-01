import { describe, expect, it, vi, type Mock } from "vitest";
import type { MSTeamsAccessTokenProvider } from "./attachments/types.js";
import {
  uploadToOneDrive,
  uploadToSharePoint,
  SIMPLE_UPLOAD_MAX_BYTES,
  UPLOAD_CHUNK_SIZE,
} from "./graph-upload.js";

/** Stub token provider that always returns a fixed token. */
const tokenProvider: MSTeamsAccessTokenProvider = {
  getAccessToken: vi.fn().mockResolvedValue("test-token"),
};

/** Helper: build a JSON Response. */
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    statusText: status === 200 ? "OK" : "Created",
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(status: number, body = ""): Response {
  return new Response(body, { status, statusText: "Bad Request" });
}

// ---------------------------------------------------------------------------
// uploadToOneDrive – small file (simple PUT)
// ---------------------------------------------------------------------------
describe("uploadToOneDrive", () => {
  it("uses simple PUT for files <= 4 MB", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ id: "item-1", webUrl: "https://od/file", name: "small.txt" }),
      );

    const result = await uploadToOneDrive({
      buffer: Buffer.alloc(1024, "x"),
      filename: "small.txt",
      tokenProvider,
      fetchFn,
    });

    expect(result).toEqual({ id: "item-1", webUrl: "https://od/file", name: "small.txt" });
    expect(fetchFn).toHaveBeenCalledOnce();
    // Should hit the simple /content endpoint, not createUploadSession
    expect(fetchFn.mock.calls[0]![0] as string).toContain("/content");
  });

  it("throws on simple PUT failure", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(errorResponse(413, "too large"));

    await expect(
      uploadToOneDrive({
        buffer: Buffer.alloc(100),
        filename: "f.txt",
        tokenProvider,
        fetchFn,
      }),
    ).rejects.toThrow("OneDrive upload failed: 413");
  });

  it("throws when simple PUT response is missing required fields", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: "x" }));

    await expect(
      uploadToOneDrive({
        buffer: Buffer.alloc(100),
        filename: "f.txt",
        tokenProvider,
        fetchFn,
      }),
    ).rejects.toThrow("OneDrive upload response missing required fields");
  });

  // -------------------------------------------------------------------------
  // Resumable upload path (file > 4 MB)
  // -------------------------------------------------------------------------
  it("uses resumable upload session for files > 4 MB", async () => {
    const fileSize = SIMPLE_UPLOAD_MAX_BYTES + 1;
    const buffer = Buffer.alloc(fileSize, "A");

    const uploadUrl = "https://upload.example.com/session/123";
    const expectedChunks = Math.ceil(fileSize / UPLOAD_CHUNK_SIZE);

    const fetchFn = vi.fn<typeof fetch>();

    // 1st call: createUploadSession
    fetchFn.mockResolvedValueOnce(jsonResponse({ uploadUrl }));

    // Intermediate chunk responses (202 Accepted)
    for (let i = 1; i < expectedChunks; i++) {
      fetchFn.mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 202, statusText: "Accepted" }),
      );
    }

    // Final chunk returns the completed driveItem
    fetchFn.mockResolvedValueOnce(
      jsonResponse({ id: "big-id", webUrl: "https://od/big", name: "big.bin" }),
    );

    const result = await uploadToOneDrive({
      buffer,
      filename: "big.bin",
      tokenProvider,
      fetchFn,
    });

    expect(result).toEqual({ id: "big-id", webUrl: "https://od/big", name: "big.bin" });

    // Total fetch calls: 1 (session) + expectedChunks
    expect(fetchFn).toHaveBeenCalledTimes(1 + expectedChunks);

    // First call should be createUploadSession
    expect(fetchFn.mock.calls[0]![0] as string).toContain("createUploadSession");

    // Chunk calls should use the upload URL with Content-Range headers
    const firstChunkCall = fetchFn.mock.calls[1]!;
    expect(firstChunkCall[0]).toBe(uploadUrl);
    const firstChunkInit = firstChunkCall[1] as RequestInit;
    expect((firstChunkInit.headers as Record<string, string>)["Content-Range"]).toBe(
      `bytes 0-${UPLOAD_CHUNK_SIZE - 1}/${fileSize}`,
    );
  });

  it("throws when createUploadSession fails", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(errorResponse(403, "Forbidden"));

    await expect(
      uploadToOneDrive({
        buffer: Buffer.alloc(SIMPLE_UPLOAD_MAX_BYTES + 1),
        filename: "f.bin",
        tokenProvider,
        fetchFn,
      }),
    ).rejects.toThrow("Create upload session failed: 403");
  });

  it("throws when createUploadSession response is missing uploadUrl", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}));

    await expect(
      uploadToOneDrive({
        buffer: Buffer.alloc(SIMPLE_UPLOAD_MAX_BYTES + 1),
        filename: "f.bin",
        tokenProvider,
        fetchFn,
      }),
    ).rejects.toThrow("Create upload session response missing uploadUrl");
  });

  it("throws when a chunk upload fails", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    fetchFn.mockResolvedValueOnce(jsonResponse({ uploadUrl: "https://up.example.com/s" }));
    fetchFn.mockResolvedValueOnce(errorResponse(500, "server error"));

    await expect(
      uploadToOneDrive({
        buffer: Buffer.alloc(SIMPLE_UPLOAD_MAX_BYTES + 1),
        filename: "f.bin",
        tokenProvider,
        fetchFn,
      }),
    ).rejects.toThrow(/Upload chunk.*failed: 500/);
  });

  it("throws when final chunk response is missing required fields", async () => {
    // Use a file that fits in exactly one chunk (just over 4 MB but within chunk size)
    const fileSize = SIMPLE_UPLOAD_MAX_BYTES + 1;
    const expectedChunks = Math.ceil(fileSize / UPLOAD_CHUNK_SIZE);
    const fetchFn = vi.fn<typeof fetch>();
    fetchFn.mockResolvedValueOnce(jsonResponse({ uploadUrl: "https://up.example.com/s" }));
    // Intermediate chunks return 202
    for (let i = 1; i < expectedChunks; i++) {
      fetchFn.mockResolvedValueOnce(new Response("{}", { status: 202, statusText: "Accepted" }));
    }
    // Final chunk returns incomplete data
    fetchFn.mockResolvedValueOnce(jsonResponse({ id: "x" }));

    await expect(
      uploadToOneDrive({
        buffer: Buffer.alloc(fileSize),
        filename: "f.bin",
        tokenProvider,
        fetchFn,
      }),
    ).rejects.toThrow("Resumable upload final response missing required fields");
  });

  it("handles multi-chunk upload with correct Content-Range headers", async () => {
    // File size that requires exactly 3 chunks
    const fileSize = UPLOAD_CHUNK_SIZE * 2 + 1000;
    const buffer = Buffer.alloc(fileSize, "B");

    const uploadUrl = "https://upload.example.com/multi";
    const fetchFn = vi.fn<typeof fetch>();

    // createUploadSession
    fetchFn.mockResolvedValueOnce(jsonResponse({ uploadUrl }));
    // Chunk 1: 202
    fetchFn.mockResolvedValueOnce(new Response("{}", { status: 202, statusText: "Accepted" }));
    // Chunk 2: 202
    fetchFn.mockResolvedValueOnce(new Response("{}", { status: 202, statusText: "Accepted" }));
    // Chunk 3 (final): 200 with driveItem
    fetchFn.mockResolvedValueOnce(
      jsonResponse({ id: "multi-id", webUrl: "https://od/multi", name: "multi.bin" }),
    );

    const result = await uploadToOneDrive({
      buffer,
      filename: "multi.bin",
      tokenProvider,
      fetchFn,
    });
    expect(result.id).toBe("multi-id");
    expect(fetchFn).toHaveBeenCalledTimes(4); // 1 session + 3 chunks

    // Verify Content-Range for each chunk
    const chunk1Headers = (fetchFn.mock.calls[1]![1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(chunk1Headers["Content-Range"]).toBe(`bytes 0-${UPLOAD_CHUNK_SIZE - 1}/${fileSize}`);

    const chunk2Headers = (fetchFn.mock.calls[2]![1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(chunk2Headers["Content-Range"]).toBe(
      `bytes ${UPLOAD_CHUNK_SIZE}-${UPLOAD_CHUNK_SIZE * 2 - 1}/${fileSize}`,
    );

    const chunk3Headers = (fetchFn.mock.calls[3]![1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(chunk3Headers["Content-Range"]).toBe(
      `bytes ${UPLOAD_CHUNK_SIZE * 2}-${fileSize - 1}/${fileSize}`,
    );
  });
});

// ---------------------------------------------------------------------------
// uploadToSharePoint – same resumable upload logic, different base URL
// ---------------------------------------------------------------------------
describe("uploadToSharePoint", () => {
  const siteId = "contoso.sharepoint.com,guid1,guid2";

  it("uses simple PUT for files <= 4 MB", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ id: "sp-1", webUrl: "https://sp/file", name: "doc.pdf" }));

    const result = await uploadToSharePoint({
      buffer: Buffer.alloc(1024),
      filename: "doc.pdf",
      tokenProvider,
      siteId,
      fetchFn,
    });

    expect(result).toEqual({ id: "sp-1", webUrl: "https://sp/file", name: "doc.pdf" });
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fetchFn.mock.calls[0]![0] as string).toContain(`/sites/${siteId}/drive/root:`);
    expect(fetchFn.mock.calls[0]![0] as string).toContain("/content");
  });

  it("uses resumable upload session for files > 4 MB", async () => {
    const fileSize = SIMPLE_UPLOAD_MAX_BYTES + 1;
    const expectedChunks = Math.ceil(fileSize / UPLOAD_CHUNK_SIZE);
    const uploadUrl = "https://upload.sp.example.com/session/sp";

    const fetchFn = vi.fn<typeof fetch>();
    fetchFn.mockResolvedValueOnce(jsonResponse({ uploadUrl }));
    // Intermediate chunk responses
    for (let i = 1; i < expectedChunks; i++) {
      fetchFn.mockResolvedValueOnce(new Response("{}", { status: 202, statusText: "Accepted" }));
    }
    // Final chunk
    fetchFn.mockResolvedValueOnce(
      jsonResponse({ id: "sp-big", webUrl: "https://sp/big", name: "big.zip" }),
    );

    const result = await uploadToSharePoint({
      buffer: Buffer.alloc(fileSize),
      filename: "big.zip",
      tokenProvider,
      siteId,
      fetchFn,
    });

    expect(result).toEqual({ id: "sp-big", webUrl: "https://sp/big", name: "big.zip" });

    // First call should be createUploadSession on the SharePoint sites endpoint
    const sessionUrl = fetchFn.mock.calls[0]![0] as string;
    expect(sessionUrl).toContain(`/sites/${siteId}/drive/root:`);
    expect(sessionUrl).toContain("createUploadSession");
  });
});
