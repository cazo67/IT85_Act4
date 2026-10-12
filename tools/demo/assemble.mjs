// Normalizes captured chapters (trim lead-in, 1920x1080 / 30 fps CFR / yuv420p / no audio), assembles B01-B12 in explicit order, verifies with ffprobe.
// Usage: node assemble.mjs --tag reh2 [--final]   (rehearsals go to mp4/rehearsals/<tag>/, a final run to mp4/)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { runDir } from "./lib/common.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const tag = arg("tag"); const isFinal = process.argv.includes("--final");
const names = { "01": "introduction", "02": "administrator_connection_dashboard", "03": "subscriber_monthly_invoice", "04": "partial_cash_receipt", "05": "gcash_proof_duplicate_guard", "06": "subscriber_ledger_statement", "07": "overdue_aging_filters", "08": "collector_remittance_shortage", "09": "payment_reversal_audit", "10": "management_pdf_xlsx_exports", "11": "role_clients_recovery", "12": "backup_restore_closing" };
const results = JSON.parse(readFileSync(join(runDir, "manifests", `chapters-${tag}.json`), "utf8"));
const out = isFinal ? join(runDir, "mp4") : join(runDir, "mp4", "rehearsals", tag);
mkdirSync(out, { recursive: true }); mkdirSync(join(runDir, "staging"), { recursive: true });
const probe = (file, extra = []) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-of", "json", ...extra, file], { encoding: "utf8", maxBuffer: 1 << 28 }));

function check(file, label) {
  const j = probe(file, ["-show_format", "-show_streams", "-count_frames"]);
  const v = j.streams.filter((s) => s.codec_type === "video"), a = j.streams.filter((s) => s.codec_type === "audio");
  const s = v[0]; const problems = [];
  if (v.length !== 1) problems.push(`video streams=${v.length}`); if (a.length) problems.push("has audio");
  if (s.codec_name !== "h264") problems.push(`codec ${s.codec_name}`); if (s.width !== 1920 || s.height !== 1080) problems.push(`size ${s.width}x${s.height}`);
  if (s.pix_fmt !== "yuv420p") problems.push(`pix_fmt ${s.pix_fmt}`); if (s.r_frame_rate !== "30/1" || s.avg_frame_rate !== "30/1") problems.push(`fps ${s.r_frame_rate}/${s.avg_frame_rate}`);
  if (s.sample_aspect_ratio && s.sample_aspect_ratio !== "1:1") problems.push(`sar ${s.sample_aspect_ratio}`);
  const frames = Number(s.nb_read_frames), duration = Number(j.format.duration);
  if (Math.abs(frames / 30 - duration) > 0.1) problems.push(`frames ${frames} vs duration ${duration}`);
  const pts = probe(file, ["-select_streams", "v:0", "-show_entries", "frame=pts_time"]).frames.map((f) => Number(f.pts_time)); let bad = 0;
  for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i] - pts[i - 1] - 1 / 30) > 0.0005) bad++;
  if (bad) problems.push(`${bad} non-1/30 pts steps`);
  execFileSync("ffmpeg", ["-v", "error", "-i", file, "-f", "null", "-"]); // full decode, errors throw
  return { label, file, frames, duration, problems };
}

// explicit order: object-key order would put "10","11","12" first
const ORDER = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
const chapters = [];
for (const id of ORDER) {
  const r = results[id]; if (!r || r.status !== "CAPTURED") throw new Error(`chapter ${id} is ${r?.status ?? "missing"}; not assembling`);
  const dest = join(out, `${id}_${names[id]}.mp4`), tmp = join(runDir, "staging", `${id}.part.mp4`);
  execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", String(Math.max(0, r.leadInSec - 0.05)), "-t", String(r.seconds + 0.4), "-i", r.raw, "-an", "-vf", "fps=30,scale=1920:1080:flags=lanczos,setsar=1,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-r", "30", "-fps_mode", "cfr", "-movflags", "+faststart", "-f", "mp4", tmp]);
  renameSync(tmp, dest); chapters.push(check(dest, id));
}
const listFile = join(runDir, "staging", "concat.txt");
writeFileSync(listFile, chapters.map((c) => `file '${c.file.replace(/\\/g, "/")}'`).join("\n"));
const finalTmp = join(runDir, "staging", "complete.part.mp4"), finalFile = join(out, "99_complete_demo.mp4");
// stream-copy concat leaves sub-tick PTS jitter at joins; re-encode the ordered join so the final file is exactly 30/1 CFR
execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", listFile, "-an", "-vf", "fps=30,setsar=1,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-r", "30", "-fps_mode", "cfr", "-video_track_timescale", "30000", "-movflags", "+faststart", "-f", "mp4", finalTmp]);
renameSync(finalTmp, finalFile);
const total = check(finalFile, "complete");
const sum = chapters.reduce((t, c) => t + c.duration, 0);
const frameSum = chapters.reduce((t, c) => t + c.frames, 0);
if (frameSum !== total.frames) total.problems.push(`frame count ${total.frames} != sum of chapters ${frameSum}`);
const report = { tag, frameSum, final: isFinal, chapterSeconds: chapters.map((c) => [c.label, Math.round(c.duration * 100) / 100]), sumChapters: Math.round(sum * 100) / 100, completeSeconds: total.duration, completeFrames: total.frames, under480: total.duration < 480, under465: total.duration <= 465, problems: [...chapters, total].flatMap((c) => c.problems.map((p) => `${c.label}: ${p}`)), sha256: createHash("sha256").update(readFileSync(finalFile)).digest("hex"), bytes: statSync(finalFile).size };
writeFileSync(join(runDir, "verification", `media-${tag}.json`), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
