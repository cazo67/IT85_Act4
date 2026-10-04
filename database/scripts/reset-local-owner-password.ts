import "./load-environment.js";

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

import { Pool } from "pg";

import { hashPassword, verifyPassword } from "../../source/apps/api/src/security/password.js";

if (process.platform !== "win32" || !process.argv.includes("--confirm-local-owner-reset")) {
  throw new Error("Run on Windows with --confirm-local-owner-reset after the account owner authorizes recovery.");
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");
const target = new URL(connectionString);
if (target.hostname !== "127.0.0.1" || target.port !== "5433" || target.pathname !== "/bcis" || decodeURIComponent(target.username) !== "bcis_app") {
  throw new Error("Owner recovery is restricted to local 127.0.0.1:5433/bcis as bcis_app.");
}

const pool = new Pool({ connectionString, max: 1 });
const temporaryPassword = randomBytes(24).toString("base64url");
const passwordHash = await hashPassword(temporaryPassword);

try {
  const connection = await pool.connect();
  try {
    await connection.query("begin");
    const targetCheck = await connection.query("select current_database() as database_name, current_user as role_name, (select count(*)::int from drizzle.__drizzle_migrations) as migrations");
    if (targetCheck.rows[0]?.database_name !== "bcis" || targetCheck.rows[0]?.role_name !== "bcis_app" || ![13, 14, 15, 16, 17, 18, 19].includes(targetCheck.rows[0]?.migrations)) {
      throw new Error("The local BCIS database identity or migration count is unexpected.");
    }
    const owner = await connection.query("select u.id from users u join user_roles ur on ur.user_id = u.id join roles r on r.id = ur.role_id where u.normalized_username = 'owner' and r.code = 'OWNER' and u.is_active = true for update of u");
    if (owner.rowCount !== 1) throw new Error("Exactly one active owner account named owner is required.");
    const ownerId = owner.rows[0]?.id as string;
    await connection.query("update users set password_hash = $1, must_change_password = true, failed_login_count = 0, locked_until = null, version = version + 1, updated_at = now() where id = $2", [passwordHash, ownerId]);
    await connection.query("update auth_sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [ownerId]);
    await connection.query("insert into audit_logs (action, entity_type, entity_id, reason, after_values) values ('user.password.reset', 'user', $1, 'Local owner recovery authorized by account owner', $2::jsonb)", [ownerId, JSON.stringify({ username: "owner", mustChangePassword: true, sessionsRevoked: true })]);
    await connection.query("commit");
    const stored = await connection.query("select password_hash, must_change_password from users where id = $1", [ownerId]);
    if (stored.rows[0]?.must_change_password !== true || !(await verifyPassword(stored.rows[0]?.password_hash as string, temporaryPassword))) {
      throw new Error("The reset committed but password verification failed; do not attempt login.");
    }
  } catch (error) {
    await connection.query("rollback");
    throw error;
  } finally {
    connection.release();
  }

  const clipboard = spawnSync("powershell.exe", ["-NoProfile", "-Command", "Set-Clipboard -Value ([Console]::In.ReadToEnd())"], {
    input: temporaryPassword,
    encoding: "utf8",
    windowsHide: true
  });
  if (clipboard.status !== 0 || clipboard.error) {
    throw new Error("Owner password reset succeeded, but copying the temporary password failed. Re-run recovery to generate a new temporary password.");
  }
  console.info("The local BCIS owner password was reset and copied to the Windows clipboard. Sign in as owner, paste it, then change it immediately. No password was printed or stored in a file.");
} finally {
  await pool.end();
}
