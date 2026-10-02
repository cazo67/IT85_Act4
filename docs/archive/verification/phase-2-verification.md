# Phase 2 Verification

> Historical record archived on 2026-09-28. Original findings, dates, and task instructions below describe an earlier checkpoint; they are not current status or new execution instructions. See [current documentation](../../README.md) and the [active completion plan](../../../BCIS_COMPLETION_PLAN.md). Original code/file references are relative to the repository root unless stated otherwise.

Date: 2026-09-22

## Implemented

- Argon2id password hashing and verification.
- Normalized unique usernames, active/inactive accounts, failed-login counters, temporary lockouts, and bootstrap password-change enforcement.
- Random opaque session tokens; only SHA-256 token hashes are stored by the server.
- Eight-hour session expiry, server-side logout/revocation, lock/unlock, and revocation of other sessions after password change.
- Server-enforced permission checks and generic authentication failures.
- Seven default roles and 29 granular permission identifiers.
- Owner safeguards that prevent deactivating/removing the last active owner and removing critical permissions from the owner role.
- User creation, activation/deactivation, role assignment API, and role-permission replacement API with audit records.
- Permission-aware desktop navigation, login, forced password change, session lock, user administration, and role matrix screens.
- Technical error responses avoid password hashes, tokens, SQL, stack traces, and filesystem details.

## Database artifacts

Migration `database/migrations/0000_premium_pestilence.sql` defines:

- `users`
- `roles`
- `permissions`
- `user_roles`
- `role_permissions`
- `auth_sessions`
- `login_attempts`
- `audit_logs`

`database/seeds/01-security.ts` creates the role/permission matrix and one bootstrap owner. It requires `DATABASE_URL` and a non-committed `BCIS_BOOTSTRAP_ADMIN_PASSWORD`; it never contains a real password in source.

Drizzle migration validation passed with `Everything's fine`. The migration was not applied because no PostgreSQL instance is installed or configured.

## Automated result

Command:

```powershell
corepack pnpm --dir source check
```

Result:

- Strict type-check passed for desktop, API, shared contracts, and database tooling.
- 14 tests passed: 9 API/auth tests, 4 shared contract tests, and 1 Electron security test.
- API, shared package, Electron main, preload, and renderer production builds passed.
- Authorization test confirms a Cashier receives HTTP 403 on a direct admin API call.
- Password-change test confirms the bootstrap password stops working and the new password works.

## Runtime result without PostgreSQL

The running API returned HTTP 503 with code `DATABASE_UNAVAILABLE` for login. This is the expected safe behavior when PostgreSQL is absent.

## Unaccepted live gates

- Apply the migration to a clean PostgreSQL database.
- Run the bootstrap security seed with a temporary private password.
- Sign in through the installed Electron client and change the bootstrap password.
- Verify persistent database audit rows, failed-login lockout, user/role changes, restart behavior, and session concurrency.

Phase 3 must not claim database acceptance until these gates pass. The official laboratory PDF is also still absent.

