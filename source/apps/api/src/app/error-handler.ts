import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AppError } from "./app-error.js";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Please correct the invalid request values.",
          fieldErrors: z.flattenError(error).fieldErrors,
          requestId: request.id
        }
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          requestId: request.id,
          ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {})
        }
      });
    }

    if (typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === 429) {
      return reply.status(429).send({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please wait and try again.",
          requestId: request.id
        }
      });
    }

    request.log.error({ err: error }, "Unhandled request error");

    void reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "The request could not be completed.",
        requestId: request.id
      }
    });
  });
}
