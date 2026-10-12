# Revised BCIS demonstration planning prompt

Use this prompt to reassess/update the demonstration plan before implementation. The project is unfinished. This prompt authorizes **inspection and planning documents only**, not application fixes, dependencies, services, fixtures, accounts, recording scripts or recording.

---

Inspect the current BCIS implementation and `BCIS_Subscription_Billing_and_Collection_Laboratory_Activity.md`, then revise `docs/DEMO_IMPLEMENTATION_PLAN.md` into a practical, evidence-backed plan for an automated desktop demonstration.

**PLAN ONLY.** Preserve existing dirty work. Do not modify application code/configuration/data, install anything, run mutation tests/seeds/builds, create accounts, start/stop services, implement recording scripts, or record. You may update the requested planning Markdown. Read the existing plan before editing it.

The assessment Markdown replaces the PDF and preserves `Page N` markers. Use its real sections: §11.1 required live sequence (pp.14–15), §7 acceptance tests (pp.11–12), §8 synthetic dataset (pp.12–13), §11.2 defense (p.15), §14 final checklist (pp.16–17), and §15 optional enhancements (p.17). Do not invent a PDF extraction or substitute example section numbers from another project.

Project: current workspace, `C:\ITSD 85 Projects\lab-04-bcis-billing-system`.

## Current implementation governs the demo

Read applicable repository instructions, `BCIS_PROGRESS_AND_DOCUMENTATION.md` from its newest top entries, the approved completion plan, actual source/routes/schemas/panels and relevant dated evidence. Older guides contain stale feature/defect statements; resolve conflicts against source and newest evidence. Inspect without exposing secrets.

Classify every required live task separately as:

- Strong rehearsal candidate: current implementation plus relevant dated local evidence.
- Implemented but full visible desktop path unverified: needs a specific live rehearsal.
- Needs a demonstrated application fix/completion: name the exact missing/broken behavior and affected source; do not infer a defect solely from absent evidence.
- Blocks selected recording: explain why no genuine allowed alternative satisfies the task.
- Conditional/outside the video: retain assessment obligations and the exact limit.

No path is recording-ready merely because a component exists. Distinguish inspected code, historical local results, proposed actions and current live checks. Identify the minimum preparation/fixes needed before recording; do not propose finishing every outstanding subsystem just for visual completeness.

A coherent, finished-looking **presentation of supported workflows** is the goal. Do not portray the unfinished project as a finished deployed product. Use real synthetic records, real saved transactions, fresh cross-role reads, real errors and real exports. Never fabricate UI, success responses, reports, terminal output, proof verification or acceptance results. Do not hide a failed required scene behind a card. Briefly identify the system as a working prototype, automated demonstration and synthetic data.

The user selected **separate local clients**. Preserve physical LAN/three-office-PC acceptance as pending. Do not claim same-host windows prove physical LAN operation. Keep packaged installation, native printing, full-scale acceptance, current-version restore and live defense separate from a source-built desktop demo.

## Mandatory story and requirement coverage

Keep all 13 §11.1 tasks visible in the coverage ledger: Administrator/dashboard; subscriber/service; monthly invoice/debit; Cash/receipt; verified-proof GCash/duplicate protection; ledger/SOA; overdue/aging/filter; collection/remittance/difference; reversal/audit; management PDF/XLSX; lower-role restrictions; backup/tested-restore explanation; conditional simultaneous clients.

Use one main account and one related collector route across scenes. A useful candidate is a genuine ₱999 September bill, ₱500 Cash, ₱499 verified GCash, zero-balance ledger/SOA, then reversal of the original Cash restoring ₱500 due. Prepare a related route's overdue subscribers and real batch entries so a new ₱500 collection produces ₱20,000 total, ₱19,500 remittance shows ₱500 shortage, and a confirmed actual training cash correction preserves the original before zero reconciliation/closure.

The activity explicitly permits **create or open**, **generate or display**, and receipt **print or preview**. Prefer an existing genuinely prepared subscriber/invoice and real receipt preview when that reduces preparation and timing. Disclose preparation; do not say generation/creation occurred on camera when it did not.

Recheck these current-source details rather than assuming the previous script is executable:

- Invoices use period-end issue dates. For an October 12 story, a prepared September invoice avoids a future October 31 issue date. Ledger/SOA filter posting time; range must cover actual postings. Do not change the host clock.
- Finalizing an already-finalized billing cycle returns its existing result; it does not add a late-created service. Prepare all intended services before that cycle's finalization. Show actual Already billed/zero-pending preview; retain a real repeated-finalization assertion separately.
- Collection internal states are DRAFT/ACTIVE; the UI labels them OPEN/IN PROGRESS. At nonzero difference it shows a warning and hides reconciliation/closure controls. Do not script a nonexistent failing reconcile click. Verify a genuine server rejection separately.
- The current subscriber profile has identity/contact/address editing, but no notes-edit form. For shared-state evidence, use Administrator's existing secondary OTHER-contact edit and Auditor's independent fresh profile read; keep payment identities stable.
- GCash submission is pending, not paid. Use the actual receiver-confirmation checkbox/dialog and verify endpoint, then duplicate protection. Direct GCash posting remains blocked even though verified-proof posting exists.
- Existing GCash/credit/other payment-method implementations must not be declared missing just because older documentation says disabled. Conversely, an enum/table is not proof of a complete adjustment, invoice-state, service-control or bonus workflow.

Map AT-01–AT-12 separately with their exact assessment amounts/results. They require supporting tests/evidence beyond a short video. Do not claim a different amount is an exact required acceptance case. Backup creation plus truthful explanation of an actual separate-target tested restore satisfies the numbered scene; do not restore the story or normal database for appearance.

## Preserve visual quality; revise input behavior

Keep the clean cards, readable white surfaces/dark text, coherent chapters and useful existing visual presentation. Change cursor/input behavior so the automation resembles normal desktop work, and disclose automation. Do not introduce decorative effects or pretend the footage was manually operated.

**Cursor:** no continuously smooth gliding, identical ease-in/out curves, cinematic Beziers or constant-speed motion. Use direct coarse movement, nonuniform speed, braking, a real stop and occasional small target correction. Typical movement 220–750 ms, decision pauses 350–1000 ms. Sometimes remain stationary while reading. Occasional 2–7 px overshoot is allowed only in proven safe geometry. No continuous jitter or random clicking. Capture the actual OS pointer; Playwright DOM movement alone may not move it.

**Typing/forms:** enter one field at a time through real keyboard input, generally 140–320 ms per visible text character with 300–800 ms word/field pauses and 600–1200 ms review. Money/reference digits can be slower and are checked before submit. No instant whole-form `fill()` or pasted completion on camera. Show normal clicks/tabs, brief rereading and one harmless revisit where appropriate. Never log or expose passwords, tokens, connection strings or private clipboard content.

**Sparse harmless imperfections:** at most two corrected text mistakes and one missed click across the whole video, with a combined ≤6-second allowance inside chapter budgets. Examples: type `Mraa`, notice, backspace to `Mara` before search; type `recout`, correct to `recount` in a nonfinancial explanation before saving; click a known blank margin once, notice lack of focus, then select the intended form field. Use real Backspace/keys and retain a seeded correction schedule. Do not force mistakes into every scene or make them look like application bugs.

Never intentionally submit a wrong amount/account/reference, misclick Post/Verify/Reverse/Restore, duplicate a financial mutation, reveal a password or bypass authorization for naturalness. Business rejection scenes must come from real intended validation, not random input errors. Ordinary cursor/typing variation must not alter final record values or undermine financial correctness.

## Bonuses and supplementary features

Inspect each §15 optional enhancement for real complete implementation. Include at most two or three already working, cheap-to-show enhancements **only after mandatory coverage**. If none exists, say so and claim none. A normal account search is not QR lookup; desktop SOA is not a customer portal; suspension history is not work orders/inventory; a dashboard is not forecasting.

Existing global search and printable route-sheet snapshot are useful supplementary core features within mandatory scenes. They are not scored §15 bonuses. Prefer these real extras to new optional development. Any proposed QR/mobile/GIS/provider/work-order enhancement stays in a separately identified future backlog; do not implement it or include fake footage.

## Capture, isolation, duration and delivery

Inspect installed/existing utilities first. Plan real Windows desktop recording with visible cursor, native dialogs, actual browser chrome/tab switches and a genuine terminal only for useful technical evidence. Browser-content-only video cannot show desktop/window/dialog evidence. Do not stub native saves/print/proof selection or business responses to fake success.

Use an owned disposable synthetic environment and separate role profiles, preserving normal `bcis`, shared test databases, user services and prior recordings. Discover actual IDs and effective permissions. Preserve committed state across chapters; restore owned checkpoints for mutation retakes, retain one payment-intent key after uncertain response and invalidate dependent footage when state changes. Stop/recover only owned demo processes. Keep secrets outside scripts/manifests/recordings.

Target silent 1920×1080 H.264/yuv420p, constant 30 fps, **450 seconds (7:30)**, with a hard complete duration **<480 seconds**. Use the existing twelve-chapter story where feasible and reserve 29 seconds of contingency. Slower typing must be timed from actual character counts/native interactions; it is not assumed to fit because a table sums to 450.

Rehearse twice. Cut supplementary print preview, duplicate navigation, optional outage and staged harmless imperfections before cutting mandatory evidence. Do not accelerate footage or rush monetary checkpoints. If all readable mandatory scenes cannot fit, report the conflict rather than silently dropping them.

All chapter/final MP4s go under `demo-output/<run-id>/mp4/`, with zero-padded meaningful chapter names and `99_complete_demo.mp4`. Raw media/logs/checkpoints/frames/reports/manifests stay in sibling folders. Preserve previous takes/runs; explicitly assemble verified chapters once in order, excluding the complete video itself.

Verify each actual file and the final result with ffprobe, decoded frame timestamps/counts, dimensions/codec/pixel format/CFR/no audio/duration; extract frames per chapter and around role/window switches. Review the whole video for readable natural interaction, same records, correct roles/results, genuine evidence and secrets. Retain failed/pending obligations honestly. A video completion ledger must not automatically mark BCIS finally accepted.

## Required planning output

Update the existing implementation plan with current facts/source evidence, per-task readiness and blockers, minimum work before recording, corrected connected story, exact coverage/actions/preconditions/checkpoints, measured-or-estimated timing, revised cursor/typing/mistake profile, real bonus eligibility, data/session/recovery design, proposed files/command, phases and verification gates.

Clearly state which commands/files remain proposals and which requirements require a fix, preparation, rehearsal or external acceptance. Finish by reporting the revised plan path, feasibility conclusion, viewing duration, real blockers and whether any actual §15 bonus exists. **Then stop. Implement/record only after a separate explicit instruction.**
