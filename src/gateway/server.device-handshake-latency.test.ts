import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  connectReq,
  getFreePort,
  installGatewayTestHooks,
  openWs,
  restoreGatewayToken,
  startGatewayServer,
  testState,
} from "./server.auth.shared.js";

installGatewayTestHooks();

describe("gateway device handshake latency", () => {
  afterEach(() => {
    restoreGatewayToken(undefined);
  });

  test("sends hello-ok before paired-device metadata refresh finishes", async () => {
    const devicePairing = await import("../infra/device-pairing.js");
    const deviceIdentity = await import("../infra/device-identity.js");
    const realUpdatePairedDeviceMetadata = devicePairing.updatePairedDeviceMetadata;

    const updateMetadataSpy = vi
      .spyOn(devicePairing, "updatePairedDeviceMetadata")
      .mockImplementation(async (...args) => {
        await new Promise((resolve) => setTimeout(resolve, 250));
        return await realUpdatePairedDeviceMetadata(...args);
      });

    testState.gatewayAuth = { mode: "token", token: "secret" };
    process.env.OPENCLAW_GATEWAY_TOKEN = "secret";

    const identityPath = join(
      tmpdir(),
      `openclaw-device-handshake-${process.pid}-${Date.now()}.json`,
    );
    const identity = deviceIdentity.loadOrCreateDeviceIdentity(identityPath);
    const request = await devicePairing.requestDevicePairing({
      deviceId: identity.deviceId,
      publicKey: deviceIdentity.publicKeyRawBase64UrlFromPem(identity.publicKeyPem),
      clientId: "test",
      clientMode: "test",
      role: "operator",
      scopes: ["operator.admin"],
    });
    await devicePairing.approveDevicePairing(request.request.requestId);

    const port = await getFreePort();
    const server = await startGatewayServer(port);
    const ws = await openWs(port);
    try {
      const startedAt = Date.now();
      const res = await connectReq(ws, {
        token: "secret",
        deviceIdentityPath: identityPath,
        timeoutMs: 150,
      });
      const elapsedMs = Date.now() - startedAt;

      expect(res.ok, JSON.stringify(res)).toBe(true);
      expect((res.payload as { type?: string } | undefined)?.type).toBe("hello-ok");
      expect(elapsedMs).toBeLessThan(200);
      expect(updateMetadataSpy).toHaveBeenCalledOnce();
    } finally {
      ws.close();
      await server.close();
      updateMetadataSpy.mockRestore();
    }
  });
});
