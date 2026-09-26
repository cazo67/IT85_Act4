import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AppError } from "../../app/app-error.js";
import type { AuthService } from "../auth/auth-service.js";
import { authorizeRequest, parseBody, readBearerToken } from "../auth/auth-routes.js";
import type { SecurityActor } from "../security-admin/security-admin-service.js";
import type { BackupService } from "./backup-service.js";

const id = z.string().uuid();

export function registerBackupRoutes(app: FastifyInstance, auth: AuthService, service: BackupService): void {
  app.addHook("onRequest", async (request) => {
    if (service.isMaintenanceMode() && !request.url.startsWith("/api/v1/health") && !request.url.startsWith("/api/v1/backups")) throw new AppError(503, "MAINTENANCE_MODE", "BCIS is temporarily unavailable for a database restore.");
  });
  app.get("/api/v1/backups", async (request) => { await authorizeRequest(auth, request, "backup.create"); return { data: await service.list() }; });
  app.get("/api/v1/backups/preflight", async (request) => { await authorizeRequest(auth, request, "backup.create"); return { data: await service.preflight() }; });
  app.post("/api/v1/backups", async (request) => { const session = await authorizeRequest(auth, request, "backup.create"); return { data: await service.create(actor(session.id, session.user.id, request.id)) }; });
  app.post("/api/v1/backups/:id/verify", async (request) => { const session = await authorizeRequest(auth, request, "backup.create"); const backupId = z.object({ id }).parse(request.params).id; return { data: await service.verify(backupId, actor(session.id, session.user.id, request.id)) }; });
  app.post("/api/v1/backups/:id/restore", async (request, reply) => {
    const session = await authorizeRequest(auth, request, "backup.restore");
    const backupId = z.object({ id }).parse(request.params).id;
    const body = parseBody(z.object({ password: z.string().min(1).max(256), confirmation: z.string().max(100) }), request.body);
    await auth.reauthenticate(readBearerToken(request), body.password);
    await service.restore(backupId, body.confirmation, actor(session.id, session.user.id, request.id));
    return reply.status(204).send();
  });
}
function actor(sessionId: string, userId: string, requestId: string): SecurityActor { return { sessionId, userId, requestId }; }
