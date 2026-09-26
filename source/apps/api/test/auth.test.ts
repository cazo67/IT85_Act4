import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app/build-app.js";
import { AuthService } from "../src/modules/auth/auth-service.js";
import { hashPassword } from "../src/security/password.js";
import { MemoryAuthStore, type MemoryUser } from "./memory-auth-store.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword("Correct-Horse-2026!");
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("authentication and authorization", () => {
  it("creates an opaque session and returns the safe user profile", async () => {
    const app = await createTestApp([makeUser("owner", ["user.manage", "role.manage"])]);
    const response = await login(app, "OWNER", "Correct-Horse-2026!");

    expect(response.statusCode).toBe(200);
    const payload = response.json().data;
    expect(payload.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(payload.user).toMatchObject({ username: "owner", roles: ["OWNER"] });
    expect(JSON.stringify(payload)).not.toContain("passwordHash");
  });

  it("uses the same generic response for an unknown user and wrong password", async () => {
    const app = await createTestApp([makeUser("cashier", ["payment.create"])]);
    const unknown = await login(app, "missing", "wrong");
    const wrong = await login(app, "cashier", "wrong");

    expect(unknown.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect(unknown.json().error).toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(wrong.json().error.message).toBe(unknown.json().error.message);
  });

  it("locks and unlocks a session without persisting a desktop credential", async () => {
    const app = await createTestApp([makeUser("owner", ["user.manage"])]);
    const token = (await login(app, "owner", "Correct-Horse-2026!")).json().data.token as string;

    expect((await app.inject({ method: "POST", url: "/api/v1/auth/lock", headers: bearer(token) })).statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: bearer(token) })).statusCode).toBe(423);
    expect((await app.inject({
      method: "POST",
      url: "/api/v1/auth/unlock",
      headers: bearer(token),
      payload: { password: "Correct-Horse-2026!" }
    })).statusCode).toBe(200);
  });

  it("rejects a cashier from an admin operation through the API", async () => {
    const app = await createTestApp([makeUser("cashier", ["payment.create"])]);
    const token = (await login(app, "cashier", "Correct-Horse-2026!")).json().data.token as string;
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/authorization-check",
      headers: bearer(token)
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
  });

  it("allows an owner with the explicit permission", async () => {
    const app = await createTestApp([makeUser("owner", ["user.manage"])]);
    const token = (await login(app, "owner", "Correct-Horse-2026!")).json().data.token as string;
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/authorization-check",
      headers: bearer(token)
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.authorized).toBe(true);
  });

  it("forces a bootstrap user to change the password and invalidates the old password", async () => {
    const user = makeUser("owner", ["user.manage"]);
    user.mustChangePassword = true;
    const app = await createTestApp([user]);
    const token = (await login(app, "owner", "Correct-Horse-2026!")).json().data.token as string;
    const changed = await app.inject({
      method: "POST",
      url: "/api/v1/auth/change-password",
      headers: bearer(token),
      payload: { currentPassword: "Correct-Horse-2026!", newPassword: "New-Private-Password-2026!" }
    });

    expect(changed.statusCode).toBe(200);
    expect(changed.json().data.mustChangePassword).toBe(false);
    expect((await login(app, "owner", "Correct-Horse-2026!")).statusCode).toBe(401);
    expect((await login(app, "owner", "New-Private-Password-2026!")).statusCode).toBe(200);
  });
});

async function createTestApp(users: MemoryUser[]) {
  const app = await buildApp({
    allowedOrigins: [],
    authService: new AuthService(new MemoryAuthStore(users))
  });
  apps.push(app);
  return app;
}

function makeUser(username: string, permissions: MemoryUser["permissions"]): MemoryUser {
  return {
    id: `${username}-id`,
    username,
    normalizedUsername: username,
    displayName: username === "owner" ? "System Owner" : "Front Desk Cashier",
    passwordHash,
    isActive: true,
    mustChangePassword: false,
    failedLoginCount: 0,
    lockedUntil: null,
    roles: username === "owner" ? ["OWNER"] : ["CASHIER"],
    permissions
  };
}

function login(app: Awaited<ReturnType<typeof buildApp>>, username: string, password: string) {
  return app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username, password } });
}

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}
