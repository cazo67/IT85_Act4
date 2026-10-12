# Gate 6 packaged-client manual attempt — 2026-10-04

This is preparation and a timed manual-test attempt, **not** packaged-client acceptance. Normal `bcis` was not used.

- Confirmed port 4100 was free, then started Fastify on `127.0.0.1:4100` with `DATABASE_URL` derived only for guarded `127.0.0.1:5433/bcis_test` and `BCIS_ALLOWED_ORIGINS=http://localhost:5173,null`. `/api/v1/health/ready` returned 200.
- Created one synthetic Owner account in `bcis_test` for manual sign-in, using a generated password copied to the local Windows clipboard; no password was written to a repository file, evidence file, or chat. The username was `gate6_manual_16ed98f0f0bc`.
- Asked the user to open the isolated candidate's unpacked executable and report startup, Online/Ready indicators and Owner dashboard login. No response or candidate process was observed during the available test window. The API log showed only the preflight readiness request; there is no evidence that the candidate launched or made a request.
- Deactivated the synthetic Owner and revoked its sessions, then stopped the guarded API. Port 4100 had no listener afterward. The copied password no longer authenticates that account.
- Hardened `source/apps/api/test/gate6-manual-actor.ts` afterward to copy future generated passwords directly to the Windows clipboard without printing them. API typecheck passed; the revised clipboard path still requires a live manual rehearsal.

Result: packaged launch/login, installed Save/Open/Print, clean install/uninstall and LAN remain **unverified**. Repeat only when the user is ready at the PC, with a fresh temporary account and guarded API.

A second brief coordination window on 2026-10-04 also started a guarded API on 4100, observed readiness 200 and created a fresh clipboard-only synthetic Owner (`gate6_manual_230eefc0df0f`). No candidate process or app API request was observed before the window ended. That account was deactivated, its sessions revoked and the API stopped. The revised clipboard path succeeded without printing the password. The next attempt should begin only after the user explicitly confirms they are at the Windows PC and ready to open the file.
