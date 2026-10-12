// Shared helpers for the demo tooling. Secrets are read from a private per-user file outside the repo and never printed.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const root = resolve(here, "..", "..", "..");
const secretDir = join(process.env.LOCALAPPDATA, "bcis-demo-secrets");
export const runId = readFileSync(join(secretDir, "current-run.txt"), "utf8").trim();
export const runDir = join(root, "demo-output", runId);
export const secretFile = join(secretDir, `${runId}.json`);
export const loadSecrets = () => JSON.parse(readFileSync(secretFile, "utf8").replace(/^﻿/, ""));
export const saveSecrets = (s) => writeFileSync(secretFile, JSON.stringify(s));
export const API = "http://127.0.0.1:4112/api/v1";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class ApiError extends Error { constructor(status, body) { super(`${status} ${body?.error?.code ?? body?.code ?? ""} ${body?.error?.message ?? body?.message ?? ""}`.trim()); this.status = status; this.body = body; } }

export const pace = { ms: 0 };
let lastCall = 0;
export async function call(method, path, opts = {}) {
  for (let attempt = 0; ; attempt++) {
    const wait = lastCall + pace.ms - Date.now(); if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    try { return await callOnce(method, path, opts); }
    catch (error) { if (error.status !== 429 || path === "/auth/login" || attempt >= 6) throw error; await sleep(20000); } // global limit is 100/min
  }
}
async function callOnce(method, path, { token, body, headers } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : undefined;
  if (!response.ok) throw new ApiError(response.status, json);
  return json?.data ?? json;
}

export async function login(username, password) {
  for (let attempt = 0; ; attempt++) {
    try {
      const data = await call("POST", "/auth/login", { body: { username, password } });
      return { token: data.token ?? data.sessionToken, user: data.user, raw: data };
    } catch (error) {
      if (error.status !== 429 || attempt >= 8) throw error;
      await sleep(15000); // login is rate limited to 5/minute
    }
  }
}
