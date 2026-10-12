// B07 overdue/aging/filter, B08 collector remittance + shortage + exact correction, B09 reversal + audit.
import { sleep } from "../lib/common.mjs";
import { sql, expect, maraOutstanding } from "../lib/sql.mjs";
import { privateSignIn, pageOf } from "../lib/session.mjs";

const resetTo = async (client, view) => { await client.page.getByRole("button", { name: view, exact: true }).click(); await sleep(500); };
// native <select>: click opens the real popup, typing selects, Enter confirms
async function pick(client, label, typed, why) {
  await client.click(client.page.getByLabel(label, { exact: true }), `open ${why}`);
  await sleep(250); await client.native.send("type", { text: typed, lo: 150, hi: 260 }); await sleep(250); await client.key("{ENTER}", `choose ${why}`);
}

export async function prep07(ctx) { await resetTo(ctx.clients.C, "Dashboard"); }
export async function b07(ctx) {
  const C = ctx.clients.C, p = C.page;
  await ctx.show("C", "Auditor client");
  await ctx.nav(C, "Receivables");
  await C.click(p.getByLabel("Receivables as of"), "focus as-of", { anchor: "left" });
  await ctx.native.send("type", { text: "12102026", lo: 160, hi: 260 }); await C.hold(900, "as-of 2026-10-12 and aging cards");
  await C.click(p.getByRole("button", { name: "Overdue accounts" }), "overdue accounts view");
  await pick(C, "Age bucket", "6", "61–90 days");
  await pick(C, "Collector", "D", "Demo Collector 1");
  await C.click(p.getByRole("button", { name: "Apply filters" }), "apply filters");
  await C.type(p.getByLabel("Search receivables"), "Nilo", "search Nilo", { review: [300, 500] });
  await C.click(p.getByRole("button", { name: "Apply filters" }), "apply");
  await p.getByText("Nilo Demo").first().waitFor({ timeout: 15000 });
  await C.hold(3500, "Nilo Demo: 3 months unpaid, ₱2,997 arrears, Collector 1");
}

export async function prep08(ctx) { await privateSignIn(ctx.clients.A.page, "supervisor"); await ctx.preload("card-collections"); }
export async function b08(ctx) {
  const A = ctx.clients.A, p = A.page;
  await ctx.card("card-collections", 4000, "collections lead");
  await ctx.show("A", "Collection Supervisor client");
  await ctx.nav(A, "Collection batches");
  await A.click(p.getByRole("row", { name: /BAT-.*IN PROGRESS/ }), "open prepared route batch");
  await p.getByText("Route collection batch").waitFor({ timeout: 15000 });
  await A.hold(2200, "IN PROGRESS, collected ₱19,500, route-sheet snapshot");
  await A.scroll(2, "route accounts");
  const select = p.getByRole("combobox").first();
  await A.click(select, "open route account list");
  await sleep(250); await ctx.native.send("type", { text: "SUB-0000052", lo: 140, hi: 230 }); await sleep(250); await A.key("{ENTER}", "choose Nilo Demo");
  await A.tabType("500.00", "collection amount", { lo: 180, hi: 340, review: [600, 900] });
  await A.click(p.getByRole("button", { name: "Post collection" }), "post collection");
  await p.getByText(/₱20,000\.00/).first().waitFor({ timeout: 15000 });
  await A.hold(2200, "collected cash ₱20,000");
  expect("collected cash", sql("select collected_cash_centavos from collection_batches"), 2000000);
  await A.click(p.getByRole("button", { name: "Submit batch" }), "submit batch");
  await p.getByText("Record remittance").waitFor({ timeout: 15000 });
  const remit = p.locator("form", { hasText: "Record remittance" }).getByRole("textbox").first();
  await A.type(remit, "19500.00", "remitted cash", { lo: 180, hi: 340, review: [700, 1000], selectAll: true });
  await A.click(p.getByRole("button", { name: "Save remittance" }), "save remittance");
  await p.getByText(/cannot be reconciled or closed until the remitted amount exactly matches/).waitFor({ timeout: 15000 });
  await A.hold(3200, "difference −₱500; reconcile and close unavailable");
  expect("difference", sql("select difference_centavos from collection_batches"), -50000);
  const reason = p.getByLabel("Correction reason");
  await A.type(reason, "Synthetic cash recout", "correction reason", { lo: 140, hi: 260, review: [250, 400] });
  ctx.rec.log({ ev: "planned_harmless_correction", from: "recout", to: "recount" });
  await sleep(600); await ctx.native.send("backspace", { count: 3 }); await sleep(300);
  await ctx.native.send("type", { text: "ount confirmed", lo: 140, hi: 240 }); await A.hold(900, "check reason");
  await A.click(p.getByRole("checkbox"), "confirm cash was counted");
  await A.click(p.getByRole("button", { name: "Record exact-match correction" }), "record correction");
  await p.getByRole("button", { name: "Reconcile balanced batch" }).waitFor({ timeout: 15000 });
  await A.hold(2600, "original ₱19,500 retained; corrected to ₱20,000");
  await A.click(p.getByRole("button", { name: "Reconcile balanced batch" }), "reconcile balanced batch");
  await A.click(p.getByRole("button", { name: "Close batch" }), "close batch");
  await A.click(p.getByRole("dialog").getByRole("button", { name: "Close batch" }), "confirm close");
  await p.getByText(/CLOSED/).first().waitFor({ timeout: 15000 });
  await A.hold(2200, "CLOSED, difference ₱0");
  expect("batch status", sql("select status from collection_batches"), "CLOSED");
  expect("correction reason", sql("select reason from remittance_corrections"), "Synthetic cash recount confirmed");
  expect("original remittance retained", sql("select remitted_cash_centavos from collector_remittances"), 1950000);
}

export async function prep09(ctx) { await resetTo(ctx.clients.C, "Dashboard"); }
export async function b09(ctx) {
  const C = ctx.clients.C, p = C.page;
  await ctx.card("role-auditor-reverse", 1500, "role card");
  await ctx.show("C", "Auditor client");
  await ctx.nav(C, "Payment history");
  await C.type(p.getByLabel("Search payment subscriber"), "Mara", "subscriber", { review: [250, 450] });
  await C.click(p.getByRole("button", { name: "Search subscribers" }), "search");
  await C.click(p.getByRole("button", { name: /SUB-0000051/ }), "select Mara Demo");
  await C.hold(1200, "Mara's payments");
  await C.click(p.getByRole("button", { name: /Reverse payment PAY-00000049/ }), "select the Cash payment");
  await C.type(p.getByLabel("Reversal reason"), "Synthetic correction: Cash entry posted to the wrong account.", "reason", { lo: 70, hi: 130, review: [600, 900] });
  await C.click(p.getByRole("button", { name: "Review reversal" }), "review reversal");
  await C.hold(1200, "confirmation dialog");
  await C.click(p.getByRole("dialog").getByRole("button", { name: "Reverse payment" }), "confirm reversal");
  await p.getByText(/REVERSED/).first().waitFor({ timeout: 15000 });
  await C.hold(2800, "REVERSED, voided receipt");
  expect("Mara outstanding after reversal", maraOutstanding(), 50000);
  await ctx.nav(C, "Audit history");
  await C.hold(3600, "payment.reverse audit event: actor and reason");
}
