import { permissionCodes, type PermissionCode } from "@bcis/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import { AppError } from "../../app/app-error.js";
import type { AuthService } from "./auth-service.js";
import type { LoginMetadata, SessionRecord } from "./auth-store.js";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(256)
});

const unlockSchema = z.object({
  password: z.string().min(1).max(256)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(12).max(256)
});

export function registerAuthRoutes(app: FastifyInstance, auth: AuthService): void {
  app.post("/api/v1/auth/login", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } }
  }, async (request) => {
    const body = parseBody(loginSchema, request.body);
    return { data: await auth.login(body.username, body.password, requestMetadata(request)) };
  });

  app.get("/api/v1/auth/me", async (request) => ({
    data: await auth.getCurrentUser(readBearerToken(request))
  }));

  app.post("/api/v1/auth/logout", async (request, reply) => {
    await auth.logout(readBearerToken(request), requestMetadata(request));
    return reply.status(204).send();
  });

  app.post("/api/v1/auth/lock", async (request, reply) => {
    await auth.lock(readBearerToken(request), requestMetadata(request));
    return reply.status(204).send();
  });

  app.post("/api/v1/auth/unlock", async (request) => {
    const body = parseBody(unlockSchema, request.body);
    return { data: await auth.unlock(readBearerToken(request), body.password, requestMetadata(request)) };
  });

  app.post("/api/v1/auth/change-password", async (request) => {
    const body = parseBody(changePasswordSchema, request.body);
    return { data: await auth.changePassword(readBearerToken(request), body.currentPassword, body.newPassword, requestMetadata(request)) };
  });

  app.get("/api/v1/permissions", async (request) => {
    await authorizeRequest(auth, request, "role.manage");
    return { data: permissionCodes };
  });

  // This protected probe becomes an integration guard for every future admin route.
  app.get("/api/v1/admin/authorization-check", async (request) => {
    const session = await authorizeRequest(auth, request, "user.manage");
    return { data: { authorized: true, userId: session.user.id } };
  });
}

export async function authorizeRequest(
  auth: AuthService,
  request: FastifyRequest,
  permission: PermissionCode
): Promise<SessionRecord> {
  const session = await auth.authenticate(readBearerToken(request));
  auth.requirePermission(session, permission);
  return session;
}

export function readBearerToken(request: FastifyRequest): string {
  const header = request.headers.authorization;
  const match = header?.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Please sign in.");
  return match[1];
}

export function requestMetadata(request: FastifyRequest): LoginMetadata {
  return {
    remoteAddress: request.ip,
    userAgent: request.headers["user-agent"] ?? "",
    requestId: request.id
  };
}

export function parseBody<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError(400, "VALIDATION_ERROR", "Please correct the highlighted fields.", z.flattenError(parsed.error).fieldErrors);
  }
  return parsed.data;
}
