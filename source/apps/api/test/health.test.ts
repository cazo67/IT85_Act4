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
});

