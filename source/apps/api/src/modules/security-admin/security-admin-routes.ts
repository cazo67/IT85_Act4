import { permissionCodeSchema, roleCodeSchema } from "@bcis/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { AuthService } from "../auth/auth-service.js";
import { authorizeRequest, parseBody, requestMetadata } from "../auth/auth-routes.js";
import type { SecurityActor, SecurityAdminService } from "./security-admin-service.js";

const createUserSchema = z.object({
  username: z.string().trim().min(3).max(100),
  displayName: z.string().trim().min(2).max(150),
  password: z.string().min(12).max(256),
  roles: z.array(roleCodeSchema).min(1)
});

const activeSchema = z.object({ isActive: z.boolean() });
const rolesSchema = z.object({ roles: z.array(roleCodeSchema).min(1) });
const permissionsSchema = z.object({ permissions: z.array(permissionCodeSchema) });

export function registerSecurityAdminRoutes(app: FastifyInstance, auth: AuthService, admin: SecurityAdminService): void {
  app.get("/api/v1/users", async (request) => {
    await authorizeRequest(auth, request, "user.manage");
    const query = z.object({ search: z.string().max(100).optional() }).parse(request.query);
    return { data: await admin.listUsers(query.search) };
  });

  app.post("/api/v1/users", async (request) => {
    const session = await authorizeRequest(auth, request, "user.manage");
    await authorizeRequest(auth, request, "role.manage");
    return { data: await admin.createUser(parseBody(createUserSchema, request.body), actor(session.id, session.user.id, request.id)) };
  });

  app.patch("/api/v1/users/:id/active", async (request, reply) => {
    const session = await authorizeRequest(auth, request, "user.manage");
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    await admin.setUserActive(params.id, parseBody(activeSchema, request.body).isActive, actor(session.id, session.user.id, request.id));
    return reply.status(204).send();
  });

  app.put("/api/v1/users/:id/roles", async (request, reply) => {
    const session = await authorizeRequest(auth, request, "role.manage");
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    await admin.setUserRoles(params.id, parseBody(rolesSchema, request.body).roles, actor(session.id, session.user.id, request.id));
    return reply.status(204).send();
  });

  app.get("/api/v1/roles", async (request) => {
    await authorizeRequest(auth, request, "role.manage");
    return { data: await admin.listRoles() };
  });

  app.put("/api/v1/roles/:id/permissions", async (request, reply) => {
    const session = await authorizeRequest(auth, request, "role.manage");
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    await admin.setRolePermissions(params.id, parseBody(permissionsSchema, request.body).permissions, actor(session.id, session.user.id, request.id));
    return reply.status(204).send();
  });
}

function actor(sessionId: string, userId: string, requestId: string): SecurityActor {
  return { sessionId, userId, requestId };
}
