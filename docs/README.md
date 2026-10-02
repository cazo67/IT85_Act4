# Documentation Guide

Updated: 2026-09-30. BCIS remains partially accepted. The supplied [laboratory activity](../BCIS_Subscription_Billing_and_Collection_Laboratory_Activity.md) is the requirements authority. For implementation and resumption, use two active files: the [approved plan](../BCIS_COMPLETION_PLAN.md) and the [current handoff/progress record](../BCIS_PROGRESS_AND_DOCUMENTATION.md). Other documents below supply detail or history.

## Active documents and ownership

| Document | Purpose |
|---|---|
| [Root README](../README.md) | Entry point and startup instructions. |
| [Completion plan](../BCIS_COMPLETION_PLAN.md) | Active approved work order, activity coverage and exit gates. |
| [Progress record](../BCIS_PROGRESS_AND_DOCUMENTATION.md) | Active current handoff, gate board, exact next task and dated evidence. |
| [Development checklist](../BCIS_Development_Status_Checklist.md) | Supporting item-level audit; the progress handoff controls current implementation status. |
| [Database guide](../database/README.md) | Controlled migration/seed instructions. |
| [Technical overview](technical-overview.md) | Architecture, boundaries and preserved design decisions. |
| [ERD/data dictionary](erd.md) | Database entities and relationships; dictionary expansion remains open. |
| [Financial invariants](architecture/financial-invariants.md) | Financial safeguards. |
| [Integration map](architecture/integration-contract-map.md) | UI/API/permission/table/evidence mapping. |
| [User manual](user-manual.md) | Operator workflows and limitations. |
| [Deployment/recovery](deployment/windows-lan.md) | Windows/LAN configuration and isolated restore procedure. |
| [Defect log](defect-log.md) | Findings, fixes and retest boundaries. |
| [Release notes](release-notes.md) | Candidate artifact and verification limitations. |
| [Test guide](../tests/README.md) | Test commands and evidence conventions. |
| [Acceptance matrix](../tests/acceptance/AT-01-AT-12.md) | AT scenario status and proof still required. |
| [Demo checklist](../tests/acceptance/demo-checklist.md) | Official demonstration rehearsal. |
| [Report samples](../reports-samples/README.md) | Synthetic sample generation and limitations. |

Together with this index and the activity, these are the 19 Keep documents. Only the plan and progress handoff direct implementation; the other documents remain references or evidence. Retain dates on historical results.

## Approved consolidation inventory

No document was discarded. The following 12 Archive originals and 2 Merge originals are preserved under docs/archive/. Archive notices distinguish old findings/instructions from current authority.

| Original path | Decision | Retained document / merged destination |
|---|---|---|
| BCIS_IMPLEMENTATION_PLAN.md | Archive | [Original implementation plan](archive/plans/BCIS_IMPLEMENTATION_PLAN.md); unresolved decisions retained in the active completion plan. |
| CODEX_BCIS_PLANNING_PROMPT.md | Archive | [Original prompt](archive/plans/CODEX_BCIS_PLANNING_PROMPT.md). |
| BCIS_Frontend_First_Remaining_Implementation_Plan (1).md | Merge | [Original frontend plan](<archive/plans/BCIS_Frontend_First_Remaining_Implementation_Plan (1).md>); task groups merged into completion plan Gate 3. |
| docs/architecture/context.md | Merge | [Original context](archive/architecture/context.md); design decisions merged into technical overview. |
| docs/architecture/phase-1-verification.md | Archive | [Phase 1](archive/verification/phase-1-verification.md). |
| docs/architecture/phase-2-verification.md | Archive | [Phase 2](archive/verification/phase-2-verification.md). |
| docs/architecture/phase-3-verification.md | Archive | [Phase 3](archive/verification/phase-3-verification.md). |
| docs/architecture/phase-4-verification.md | Archive | [Phase 4](archive/verification/phase-4-verification.md). |
| docs/architecture/phase-5-verification.md | Archive | [Phase 5](archive/verification/phase-5-verification.md). |
| docs/architecture/phase-6-verification.md | Archive | [Phase 6](archive/verification/phase-6-verification.md). |
| docs/architecture/phase-7-verification.md | Archive | [Phase 7](archive/verification/phase-7-verification.md). |
| docs/architecture/phase-8-verification.md | Archive | [Phase 8](archive/verification/phase-8-verification.md). |
| docs/architecture/phase-9-verification.md | Archive | [Phase 9](archive/verification/phase-9-verification.md). |
| docs/architecture/phase-10-verification.md | Archive | [Phase 10](archive/verification/phase-10-verification.md). |

Counts: 33 originals represented; 19 Keep, 2 Merge, 12 Archive, zero deletion candidates. Historical root-relative paths in archived text and older progress entries are provenance, not current file-navigation links. The old-to-new map above resolves them.

## Evidence and future cleanup

Use Verified, Implemented but unverified, Partial, Blocked by policy or Missing with environment/date and evidence. Automated rule tests, a built installer, and backup catalog verification are not full workflow/installation/restore acceptance.

Only consider future deletion after content is proven duplicated and preserved elsewhere, with explicit approval. Maintain BCIS_COMPLETION_PLAN.md: the source-integrity checker requires that path. Update relative links whenever moving a document, preserve uncommitted work and do not edit historical test outcomes into later successes.
