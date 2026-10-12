// B04 partial Cash + receipt, B05 GCash proof / verification / duplicate guard, B06 ledger + Statement of Account.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sleep, runDir } from "../lib/common.mjs";
import { sql, expect, maraOutstanding } from "../lib/sql.mjs";

const PROOF = "C:\\bcis-demo-proof\\proof.png";
const assets = () => JSON.parse(readFileSync(join(runDir, "manifests", "assets.json"), "utf8"));
const resetTo = async (client, view) => { await client.page.getByRole("button", { name: view, exact: true }).click(); await sleep(500); };

export async function prep04(ctx) { await resetTo(ctx.clients.B, "Dashboard"); expect("Mara outstanding before B04", maraOutstanding(), 99900); }
export async function b04(ctx) {
  const B = ctx.clients.B, p = B.page;
  await ctx.card("role-cashier", 1500, "role card");
  await ctx.show("B", "Cashier client");
  await B.hold(900, "Cashier role badge");
  await ctx.nav(B, "Receive payment");
  await B.type(p.getByPlaceholder("Search subscriber account or name"), "Mara", "subscriber search", { review: [350, 600] });
  await B.click(p.getByRole("button", { name: "Search", exact: true }), "search");
  await B.click(p.getByRole("button", { name: /SUB-0000051 · Mara Demo/ }), "select Mara Demo");
  await B.hold(900, "selected account");
  await B.type(p.getByLabel("Amount in PHP"), "500.00", "amount", { lo: 180, hi: 380, review: [700, 1000] });
  await B.click(p.getByRole("button", { name: "Preview allocation" }), "preview allocation");
  await p.getByText("Allocation preview").waitFor({ timeout: 15000 });
  await B.hold(2400, "₱500 allocated, ₱999 outstanding");
  await B.click(p.getByRole("button", { name: "Confirm and issue receipt" }), "confirm and issue receipt");
  const dlg = p.getByRole("dialog"); if (await dlg.count()) { await B.hold(1200, "confirmation dialog"); await B.click(dlg.getByRole("button", { name: /confirm|issue|post/i }).last(), "confirm dialog"); }
  await p.getByText("BCIS OFFICIAL RECEIPT").waitFor({ timeout: 20000 });
  await B.hold(3500, "receipt: account, number, Cash, ₱500");
  ctx.rec.log({ ev: "assert", ...Object.fromEntries([["maraOutstanding", expect("Mara outstanding after B04", maraOutstanding(), 49900)]]) });
}

export async function prep05(ctx) { await resetTo(ctx.clients.B, "Dashboard"); await resetTo(ctx.clients.C, "Dashboard"); await ctx.preload("card-gcash"); }
async function submitProof(ctx, ref, { first }) {
  const B = ctx.clients.B, p = B.page;
  if (first) {
    await B.type(p.getByLabel("Find GCash subscriber"), "Mara", "subscriber search", { review: [250, 450], selectAll: true });
    await B.click(p.getByRole("button", { name: "Search subscriber" }), "search subscriber");
    await B.click(p.getByRole("button", { name: /SUB-0000051/ }), "select Mara Demo");
  }
  await B.type(p.getByLabel("GCash amount in PHP"), "499.00", "amount", { lo: 180, hi: 340, review: [500, 800] });
  await B.tabType("Demo Sender", "sender name", { lo: 120, hi: 240 });
  await B.tabType("09170000000", "sender mobile", { lo: 140, hi: 240 });
  await B.tabType(ref, "reference", { lo: 160, hi: 300, review: [700, 1000] });
  await B.key("{TAB}", "to proof image"); await sleep(300); await B.key(" ", "open file chooser");
  const d = await ctx.native.send("waitdialog", { title: "Open", timeoutMs: 15000 }); if (!d.found) throw new Error("native file chooser did not appear");
  await sleep(500);
  await ctx.native.send("type", { text: PROOF, lo: 15, hi: 35 }); await sleep(400); await ctx.native.send("keys", { seq: "{ENTER}" });
  const closed = await ctx.native.send("dialogclosed", { title: "Open", timeoutMs: 15000 }); if (!closed.closed) throw new Error("file chooser did not close"); await sleep(500);
  ctx.rec.log({ ev: "file_selected", path: PROOF });
  await B.hold(500, "review form");
  await B.click(p.getByRole("button", { name: "Submit proof for review" }), "submit proof");
}
export async function b05(ctx) {
  const ref = assets().reference; const B = ctx.clients.B, C = ctx.clients.C, p = B.page;
  await ctx.card("card-gcash", 3000, "GCash lead card");
  await ctx.show("B", "Cashier submits proof");
  await ctx.nav(B, "Submit GCash proof");
  await submitProof(ctx, ref, { first: true });
  await p.getByText(/is pending review\. No payment was posted\./).waitFor({ timeout: 20000 });
  await B.hold(2200, "PENDING — no payment posted");
  expect("payments for ref before verify", sql(`select count(*) from payments where normalized_external_reference = '${ref}'`), 0);
  // Auditor verifies after checking the labelled synthetic receiver log
  await ctx.card("role-auditor-verify", 1500, "role card");
  await ctx.show("C", "Auditor client");
  await ctx.nav(C, "GCash proofs");
  await C.click(C.page.getByRole("button", { name: new RegExp(`Review GCash proof ${ref}`) }), "open proof");
  await C.hold(2000, "proof image and details");
  await ctx.preload("receiver-log"); await ctx.show("EDGE", "synthetic receiver log"); await sleep(1700);
  await ctx.show("C", "back to BCIS");
  await C.click(C.page.getByLabel("Receiver GCash history confirmed"), "confirm receiver history");
  await C.click(C.page.getByRole("button", { name: /Review verification and posting/ }), "review verification");
  await C.hold(1200, "confirmation dialog");
  await C.click(C.page.getByRole("button", { name: "Verify and post GCash payment" }), "verify and post");
  await C.page.getByText(/VERIFIED/).first().waitFor({ timeout: 20000 });
  await C.hold(2600, "VERIFIED, payment and receipt");
  expect("payments for ref after verify", sql(`select count(*) from payments where normalized_external_reference = '${ref}' and status='POSTED'`), 1);
  expect("Mara outstanding after GCash", maraOutstanding(), 0);
  // duplicate: same reference with different punctuation/case
  await ctx.card("role-cashier-dup", 1500, "role card");
  await ctx.show("B", "Cashier repeats reference");
  const dup = ref.replace(/^DEMO/, "demo-");
  await submitProof(ctx, dup, { first: false });
  await p.getByRole("alert").first().waitFor({ timeout: 20000 });
  await B.hold(3200, "duplicate reference rejected");
  expect("verified payments still one", sql(`select count(*) from payments where normalized_external_reference = '${ref}' and status='POSTED'`), 1);
}

export async function prep06(ctx) { await resetTo(ctx.clients.C, "Dashboard"); }
export async function b06(ctx) {
  const C = ctx.clients.C, p = C.page;
  await ctx.card("role-auditor-ledger", 1500, "role card");
  await ctx.show("C", "Auditor client");
  await C.click(p.getByRole("button", { name: "Search BCIS records" }), "open global search");
  await C.type(p.getByLabel(/^Search account, name, contact, address/), "Mara", "search text", { review: [250, 400], selectAll: true });
  await C.click(p.getByRole("button", { name: "Search", exact: true }), "search");
  await C.click(p.getByRole("button", { name: /SUB-0000051/ }), "open Mara Demo");
  await p.getByRole("heading", { name: "Mara Demo" }).waitFor({ timeout: 15000 });
  await C.scroll(5, "subscriber ledger");
  await C.type(p.getByLabel("Ledger from date"), "01092026", "ledger from", { lo: 170, hi: 280, anchor: "left", review: [300, 500] });
  await C.type(p.getByLabel("Ledger to date"), "12102026", "ledger to", { lo: 170, hi: 280, anchor: "left", review: [300, 500] });
  await C.click(p.getByRole("button", { name: "Apply dates" }), "apply dates");
  await C.hold(3200, "debit ₱999, credits ₱500 and ₱499, closing balance ₱0");
  await C.scroll(3, "statement of account");
  await C.type(p.getByRole("textbox", { name: "From", exact: true }), "01092026", "statement from", { lo: 170, hi: 280, anchor: "left", review: [300, 500] });
  await C.click(p.getByRole("button", { name: "Preview statement" }), "preview statement");
  await C.hold(3600, "statement closing balance ₱0");
}
