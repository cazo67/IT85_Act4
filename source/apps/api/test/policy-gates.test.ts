import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app/build-app.js";
import type { BcisDatabase } from "../src/db/client.js";
import { AuthService } from "../src/modules/auth/auth-service.js";
import type { BillingService } from "../src/modules/billing/billing-service.js";
import { PaymentService } from "../src/modules/payments/payment-service.js";
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

describe("unapproved policy gates", () => {
  it("blocks GCash posting before touching the database", async () => {
    const { app, token } = await createApp(["payment.create"]);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/payments",
      headers: bearer(token),
      payload: {
        subscriberId: "00000000-0000-4000-8000-000000001001",
        amountCentavos: "100000",
        method: "GCASH",
        commandKey: "00000000-0000-4000-8000-000000009001"
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("GCASH_POLICY_NOT_APPROVED");
  });

  it("blocks GCash proof upload with an explicit policy error", async () => {
    const { app, token } = await createApp(["payment.create"]);
    const response = await app.inject({ method: "POST", url: "/api/v1/gcash/proofs", headers: bearer(token) });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("GCASH_POLICY_NOT_APPROVED");
  });

  it("blocks invoice voiding while preserving permission enforcement", async () => {
    const { app, token } = await createApp(["billing.adjust"]);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/invoices/00000000-0000-4000-8000-000000002001/void",
      headers: bearer(token),
      payload: { reason: "Approved test reason only" }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("POLICY_NOT_APPROVED");
  });

  it("rejects invoice voiding before revealing its policy state", async () => {
    const { app, token } = await createApp(["billing.view"]);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/invoices/00000000-0000-4000-8000-000000002001/void",
      headers: bearer(token),
      payload: { reason: "Approved test reason only" }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
  });
});

async function createApp(permissions: MemoryUser["permissions"]) {
  const user: MemoryUser = {
    id: "owner-id",
    username: "owner",
    normalizedUsername: "owner",
    displayName: "System Owner",
    passwordHash,
    isActive: true,
    mustChangePassword: false,
    failedLoginCount: 0,
    lockedUntil: null,
    roles: ["OWNER"],
    permissions
  };
  const authService = new AuthService(new MemoryAuthStore([user]));
  const app = await buildApp({
    allowedOrigins: [],
    authService,
    paymentService: new PaymentService({} as BcisDatabase),
    billingService: {} as BillingService
  });
  apps.push(app);
  const login = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { username: "owner", password: "Correct-Horse-2026!" } });
  return { app, token: login.json().data.token as string };
}

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}
