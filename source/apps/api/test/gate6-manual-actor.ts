import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

import { Pool } from "pg";

import { hashPassword } from "../src/security/password.js";

const uri = process.env.BCIS_TEST_DATABASE_URL ?? "";
const action = process.argv[2];
const target = new URL(uri);
if (target.hostname !== "127.0.0.1" || target.port !== "5433" || target.pathname !== "/bcis_test") {
  throw new Error("Gate 6 manual accounts are restricted to guarded 127.0.0.1:5433/bcis_test.");
}
if (action !== "create" && action !== "revoke") throw new Error("Use create or revoke <username>.");

const pool = new Pool({ connectionString: uri, max: 1 });
try {
  const identity = await pool.query("select current_database() as name, (select count(*)::int from drizzle.__drizzle_migrations) as migrations");
  if (identity.rows[0]?.name !== "bcis_test" || identity.rows[0]?.migrations !== 19) throw new Error("The guarded test database is not at migration 19.");
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (action === "create") {
      const role = await client.query("select id from roles where code = 'OWNER'");
      if (!role.rows[0]?.id) throw new Error("The synthetic OWNER role is missing.");
      const username = `gate6_manual_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
      const password = randomBytes(24).toString("base64url");
      const user = await client.query(
        "insert into users (username, normalized_username, display_name, password_hash, must_change_password) values ($1, $1, $2, $3, false) returning id",
        [username, "Gate 6 Manual Test Owner", await hashPassword(password)]
      );
      await client.query("insert into user_roles (user_id, role_id) values ($1, $2)", [user.rows[0]?.id, role.rows[0].id]);
      await copyPasswordToClipboard(password);
      await client.query("commit");
      process.stdout.write(`${username} created; temporary password copied to the local clipboard.\n`);
    } else {
      const username = process.argv[3] ?? "";
      if (!/^gate6_manual_[a-f0-9]{12}$/.test(username)) throw new Error("Only a Gate 6 synthetic account may be revoked.");
      const user = await client.query("select id from users where normalized_username = $1 for update", [username]);
      if (user.rows.length !== 1) throw new Error("The Gate 6 synthetic account was not found.");
      await client.query("update auth_sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [user.rows[0].id]);
      await client.query("update users set is_active = false, updated_at = now(), version = version + 1 where id = $1", [user.rows[0].id]);
      await client.query("commit");
      process.stdout.write(`${username} deactivated and sessions revoked.\n`);
    }
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}

function copyPasswordToClipboard(password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-Command", "Set-Clipboard -Value ([Console]::In.ReadToEnd())"], { stdio: ["pipe", "ignore", "pipe"], windowsHide: true });
    let errorText = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { errorText += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`Clipboard copy failed (${code}): ${errorText.trim()}`)));
    child.stdin.end(password);
  });
}
