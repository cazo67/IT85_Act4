# Test and Acceptance Guide

- Run `Run-StaticAcceptance.ps1` from this folder for typecheck, automated tests, production builds, and schema consistency.
- Review `acceptance/AT-01-AT-12.md` for the acceptance matrix. “Partial” means automated evidence exists but a required live or installed-environment check is still open.
- Follow `acceptance/demo-checklist.md` only in an approved environment with synthetic data.
- Store future screenshots, logs, checksums, and signed results in a dated evidence folder; do not commit credentials, customer data, database dumps, or payment proofs.

Static success does not establish live database, installer, printer, backup/restore, or three-PC acceptance.
