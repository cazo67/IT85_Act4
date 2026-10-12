// B01 introduction, B02 Administrator connection/dashboard, B03 subscriber / monthly invoice. Real pointer + keyboard only.
import { sleep } from "../lib/common.mjs";
import { privateSignOut } from "../lib/session.mjs";

export const MARA = { account: "SUB-0000051", invoice: "INV-202609-00000243" };

export async function prep01(ctx) { await privateSignOut(ctx.clients.A.page); await ctx.preload("card-intro"); }
export async function b01(ctx) {
  await ctx.card("card-intro", 6000, "introduction card");
}

export async function b02(ctx) {
  const A = ctx.clients.A, p = A.page;
  await ctx.card("role-admin", 1500, "role card");
  await ctx.show("A", "Administrator client");
  await A.hold(700, "read login screen");
  await A.type(p.getByLabel("Username"), "adm.demo", "username", { review: [400, 700] });
  const { credentials } = await import("../lib/session.mjs");
  await A.type(p.getByLabel("Password"), credentials("admin").password, "password", { secret: true, lo: 90, hi: 190, review: [350, 600] });
  await A.click(p.getByRole("button", { name: "Sign in", exact: true }), "sign in");
  await p.getByRole("button", { name: "Sign out" }).waitFor({ timeout: 25000 });
  await A.hold(1500, "dashboard and role badge");
  await A.click(p.getByRole("button", { name: "Check connection" }), "check connection");
  await p.getByText("Online").first().waitFor({ timeout: 15000 }); await p.getByText("Ready").first().waitFor({ timeout: 15000 });
  await A.hold(1800, "API Online / PostgreSQL Ready");
  await A.scroll(2, "operational summary"); await A.hold(2200, "live KPIs");
}

export async function b03(ctx) {
  const A = ctx.clients.A, p = A.page;
  await ctx.show("A", "Administrator client");
  // global search with one planned harmless correction (typed text only; nothing is submitted before correcting)
  await A.click(p.getByRole("button", { name: "Search BCIS records" }), "open global search");
  const box = p.getByLabel(/^Search account, name, contact, address/);
  await A.type(box, "Mraa", "search text", { review: [250, 400], selectAll: true });
  ctx.rec.log({ ev: "planned_harmless_correction", from: "Mraa", to: "Mara" });
  await sleep(600); await ctx.native.send("backspace", { count: 3 }); await sleep(350);
  await ctx.native.send("type", { text: "ara", lo: 160, hi: 280 }); await A.hold(500, "check search text");
  await A.click(p.getByRole("button", { name: "Search", exact: true }), "search");
  await A.click(p.getByRole("button", { name: /SUB-0000051/ }), "open Mara Demo");
  await p.getByRole("heading", { name: "Mara Demo" }).waitFor({ timeout: 15000 });
  await A.scroll(3, "services and rate"); await A.hold(2200, "Internet 50 Mbps / current rate");
  await A.scroll(4, "ledger debit"); await A.hold(2600, "ledger debit INV-202609-00000243");
  // invoice record
  await ctx.nav(A, "Invoices");
  await A.type(p.getByLabel("Search invoice number"), MARA.invoice, "invoice number", { lo: 90, hi: 170, review: [350, 600] });
  await A.click(p.getByRole("button", { name: "Search", exact: true }), "search invoice");
  await A.click(p.getByRole("button", { name: `View invoice ${MARA.invoice}` }), "open invoice");
  await A.hold(2600, "September invoice, due date and total");
  // finalized-period preview shows Already billed
  await ctx.nav(A, "Generate billing");
  await A.click(p.getByLabel("Billing month"), "focus billing month", { anchor: "left" });
  await ctx.native.send("type", { text: "09", lo: 200, hi: 300 }); await ctx.native.send("keys", { seq: "{RIGHT}" }); await sleep(250);
  await ctx.native.send("type", { text: "2026", lo: 200, hi: 300 }); await A.hold(500, "month 2026-09");
  const typed = await p.getByLabel("Billing month").inputValue();
  if (typed !== "2026-09") throw new Error(`billing month field reads ${typed}, expected 2026-09; aborting before Preview`);
  await A.click(p.getByRole("button", { name: "Preview", exact: true }), "preview");
  await p.getByText("Already billed").first().waitFor({ timeout: 15000 });
  await A.hold(2600, "Already billed, 0 pending");
}
