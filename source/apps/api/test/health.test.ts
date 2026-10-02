import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app/build-app.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("health routes", () => {
  it("reports that the API process is alive", async () => {
    const app = await buildApp({ allowedOrigins: [] });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/v1/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ service: "bcis-api", status: "ok" });
  });

  it("does not claim readiness without a database configuration", async () => {
    const app = await buildApp({ allowedOrigins: [] });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/v1/health/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("DATABASE_NOT_CONFIGURED");
  });

  it("reports readiness after a successful database check", async () => {
    const app = await buildApp({ allowedOrigins: [], checkDatabase: async () => undefined });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/v1/health/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ database: "ready", status: "ready" });
  });

  it("allows the packaged Electron file origin only when explicitly configured", async () => {
    const app = await buildApp({ allowedOrigins: ["http://localhost:5173", "null"] });
    apps.push(app);

    const preflight = await app.inject({ method: "OPTIONS", url: "/api/v1/health/live", headers: { origin: "null", "access-control-request-method": "GET" } });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe("null");

    const health = await app.inject({ method: "GET", url: "/api/v1/health/live", headers: { origin: "null" } });
    expect(health.statusCode).toBe(200);
    expect(health.headers["access-control-allow-origin"]).toBe("null");

    for (const method of ["PATCH", "PUT"]) {
      const editPreflight = await app.inject({ method: "OPTIONS", url: "/api/v1/subscribers/00000000-0000-0000-0000-000000000000", headers: { origin: "null", "access-control-request-method": method, "access-control-request-headers": "authorization,content-type" } });
      expect(editPreflight.statusCode).toBe(204);
      expect(String(editPreflight.headers["access-control-allow-methods"])).toContain(method);
      expect(editPreflight.headers["access-control-allow-origin"]).toBe("null");
    }
  });

  it("denies foreign origins and does not silently enable file origins", async () => {
    const app = await buildApp({ allowedOrigins: ["http://localhost:5173"] });
    apps.push(app);
    const packaged = await app.inject({ method: "GET", url: "/api/v1/health/live", headers: { origin: "null" } });
    const foreign = await app.inject({ method: "GET", url: "/api/v1/health/live", headers: { origin: "https://untrusted.example" } });
    expect(packaged.headers["access-control-allow-origin"]).toBeUndefined();
    expect(foreign.headers["access-control-allow-origin"]).toBeUndefined();
    expect(packaged.statusCode).not.toBe(200);
    expect(foreign.statusCode).not.toBe(200);
  });
});

