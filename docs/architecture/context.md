# BCIS Architecture Context

## System boundary

BCIS uses three installed Electron clients and one central Fastify API on the office LAN. PostgreSQL, attachments, reports, logs, and backups belong to the server side. A client never opens a shared database file and the renderer never receives database credentials.

```text
Electron renderer
  ↕ narrow typed preload API for approved OS operations
Electron main
  ↕ HTTP to the configured LAN server
Fastify API
  ↕ domain services and Drizzle repositories
PostgreSQL + controlled server storage
```

## Phase 1 decisions

- The buildable code is a pnpm workspace under `source/`.
- Electron uses electron-vite with `contextIsolation`, sandboxing, and no renderer Node integration.
- Fastify provides versioned liveness and readiness routes. Liveness proves the process responds; readiness also requires PostgreSQL.
- Environment parsing is server-side and validated with Zod. Renderer configuration contains only the public API base URL.
- The requested shadcn preset `b2D0xPXaU` resolves to the `radix-luma` style. Because the shadcn CLI does not recognize electron-vite as a standard Vite app, the preset was generated in an isolated Vite reference project and its configuration/token structure was reproduced in the nested renderer. Required BCIS navy/blue/semantic colors deliberately replace the preset's sample colors.
- Lucide remains the application icon library as required by the laboratory stack. Generated shadcn primitives are kept under `components/ui` and app components compose them.

## Live infrastructure gate

This development machine has no PostgreSQL client/server or Docker. API injection tests cover ready, unavailable, and unconfigured database states, but a live PostgreSQL readiness result remains unverified until infrastructure is supplied.

