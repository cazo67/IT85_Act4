// Generates cards, the synthetic GCash proof PNG and the labelled training receiver log as local HTML/PNG assets.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { runDir } from "./lib/common.mjs";

const dir = join(runDir, "assets"); mkdirSync(dir, { recursive: true });
const manifest = join(runDir, "manifests", "assets.json");
const prior = existsSync(manifest) ? JSON.parse(readFileSync(manifest, "utf8")) : null;
const reference = prior?.reference ?? `DEMO${randomBytes(3).toString("hex").toUpperCase()}499`;
const fileUrl = (p) => "file:///" + p.replace(/\\/g, "/");
const page = (body, extra = "") => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>BCIS demonstration</title><style>
html,body{margin:0;height:100%;background:#fff;color:#0F172A;font-family:Inter,"Segoe UI",system-ui,sans-serif}
.wrap{box-sizing:border-box;height:100%;padding:120px 180px;display:flex;flex-direction:column;justify-content:center;gap:28px}
h1{font-size:64px;line-height:1.15;margin:0;font-weight:700}p{font-size:38px;line-height:1.4;margin:0;max-width:1450px}
.role{font-size:44px;font-weight:700;color:#2563EB}.accent{color:#2563EB}${extra}</style><body>${body}</body></html>`;
const card = (h, lines) => page(`<div class="wrap"><h1>${h}</h1>${lines.map((l) => `<p>${l}</p>`).join("")}</div>`);
const cards = {
  "card-intro": card("BCIS working prototype", ["Invoice, Cash and verified GCash, collector accountability, audit, and recovery.", "Automated demonstration · synthetic data."]),
  "card-gcash": card("GCash proof is evidence, not payment", ["An uploaded image records a pending claim. Only receiver-history confirmation posts the payment.", "All payment evidence here is synthetic."]),
  "card-collections": card("Collector accountability", ["<span class=role>Role: Collection Supervisor</span>", "Records a collection, remits cash and reconciles the batch.", "A ₱500 shortage must remain visible.", "A confirmed cash correction preserves the original remittance before reconciliation."]),
  "card-security": card("Roles and server enforcement", ["<span class=role>Role: Cashier</span>", "Tries an admin-only request and is refused.", "Each role has its own session.", "The API enforces permissions even when called directly."]),
  "card-closing": card("Backup verified", ["Restore is tested separately against a disposable database with financial comparisons.", "Local clients shown; physical LAN and live technical defense remain separate. BCIS is unfinished.", "Automated demonstration · synthetic data."])
};
const roleCards = {"role-admin": ["Administrator", "Signs in, checks the connection, opens a subscriber and the monthly invoice."], "role-cashier": ["Cashier", "Receives ₱500 Cash and issues a receipt."], "role-auditor-verify": ["Accounting / Auditor", "Verifies the GCash proof against the receiver record."], "role-cashier-dup": ["Cashier", "Submits the same reference again to test duplicate protection."], "role-auditor-ledger": ["Accounting / Auditor", "Reads the subscriber ledger and Statement of Account."], "role-auditor-reverse": ["Accounting / Auditor", "Reverses the Cash payment and reviews the audit trail."], "role-admin-contact": ["Administrator", "Edits a secondary contact."], "role-auditor-reload": ["Accounting / Auditor", "Reloads the profile to see the saved change."], "role-owner": ["Owner / Super Admin", "Creates and verifies a backup."]};
for (const [k, [r, t]] of Object.entries(roleCards)) cards[k] = page(`<div class="wrap"><h1>Role: ${r}</h1><p>${t}</p></div>`);
for (const [name, html] of Object.entries(cards)) writeFileSync(join(dir, `${name}.html`), html);
writeFileSync(join(dir, "receiver-log.html"), page(`<div class="wrap" style="gap:18px"><h1>Training receiver transaction log</h1><p style="font-size:30px;color:#B45309">SYNTHETIC TRAINING RECORD — not a real GCash or Facebook account</p>
<table style="font-size:34px;border-collapse:collapse;margin-top:24px"><tr style="background:#F1F5F9"><th align=left style="padding:14px 28px">Reference</th><th align=left style="padding:14px 28px">Amount</th><th align=left style="padding:14px 28px">Sender</th><th align=left style="padding:14px 28px">Status</th></tr>
<tr><td style="padding:14px 28px;border-top:1px solid #CBD5E1"><b>${reference}</b></td><td style="padding:14px 28px;border-top:1px solid #CBD5E1">₱499.00</td><td style="padding:14px 28px;border-top:1px solid #CBD5E1">Demo Sender</td><td style="padding:14px 28px;border-top:1px solid #CBD5E1;color:#059669"><b>RECEIVED</b></td></tr></table></div>`));
const proofHtml = join(dir, "proof-source.html");
writeFileSync(proofHtml, `<!doctype html><meta charset="utf-8"><body style="margin:0;width:900px;height:560px;background:#EFF6FF;font-family:Segoe UI,sans-serif;color:#0F172A;position:relative;overflow:hidden">
<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:84px;font-weight:800;color:rgba(220,38,38,.18);transform:rotate(-18deg)">SYNTHETIC TRAINING PROOF</div>
<div style="padding:44px"><div style="font-size:30px;color:#2563EB;font-weight:700">Payment sent (training sample)</div><div style="font-size:64px;font-weight:800;margin:18px 0">₱499.00</div>
<div style="font-size:30px">To: BCIS Demo Receiver</div><div style="font-size:30px">From: Demo Sender · 09170000000</div><div style="font-size:30px;margin-top:14px">Ref No. <b>${reference}</b></div><div style="font-size:24px;color:#64748B;margin-top:18px">Fictional image generated for the BCIS laboratory demonstration.</div></div></body>`);
const edge = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"].find(existsSync);
const proofPng = join(dir, "synthetic-gcash-proof.png");
if (!existsSync(proofPng)) execFileSync(edge, ["--headless", "--disable-gpu", "--hide-scrollbars", "--virtual-time-budget=3000", "--force-device-scale-factor=1", `--user-data-dir=${join(runDir, "runtime", "edge-headless")}`, `--screenshot=${proofPng}`, "--window-size=900,560", fileUrl(proofHtml)], { stdio: "ignore", timeout: 60000 });
writeFileSync(manifest, JSON.stringify({ reference, proofPng, cards: Object.keys(cards), edge }, null, 1));
console.log("assets ok; reference", reference, "proof", existsSync(proofPng));
