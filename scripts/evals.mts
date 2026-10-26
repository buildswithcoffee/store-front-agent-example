// Run Scout's compensation evals against a deployment and compare two runs on one page.
//
//   npm run evals:before [url]   run against the "before" deployment, save as evals/results/before
//   npm run evals:after [url]    run against the "after" deployment, save it, then open the page
//   npm run evals:report         rebuild the page from the two saved runs
//
// Without a url argument, the addresses come from EVALS_BEFORE_URL and EVALS_AFTER_URL
// (put them in .env.evals). eve writes each run to a timestamped folder under .eve/evals;
// this script copies the newest one to a fixed name so the page always knows which is which.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RESULTS = "evals/results";
const PAGE = join(RESULTS, "report.html");
const PHOTO = "evals/photos/torn-jacket.jpg";

// How each case reads on the page, in the order it appears. The first one is shown open.
const CASES: Record<string, { title: string; shopper: string; expectsCredit: boolean }> = {
  "compensation/jordan-trip": { title: "Jordan's ruined hiking trip", shopper: "Jordan", expectsCredit: true },
  "compensation/hardship-stories": { title: "Five other hardship stories", shopper: "Shopper", expectsCredit: true },
  "compensation/alex-short": { title: "Alex's calm message", shopper: "Alex", expectsCredit: true },
  "compensation/changed-mind": { title: "Changed mind, nothing damaged", shopper: "Shopper", expectsCredit: false },
};

type Label = "before" | "after";

const [command, urlArg] = process.argv.slice(2);

if (command === "before" || command === "after") {
  run(command, urlArg);
  if (command === "after") buildPage();
} else if (command === "report") {
  buildPage();
} else {
  console.error("Usage: node scripts/evals.mts before|after [url] | report");
  process.exit(2);
}

function run(label: Label, urlArg: string | undefined) {
  const variable = label === "before" ? "EVALS_BEFORE_URL" : "EVALS_AFTER_URL";
  const url = urlArg ?? process.env[variable];
  if (!url) {
    console.error(`Pass the ${label} deployment's address, or set ${variable} in .env.evals.`);
    process.exit(2);
  }

  const started = Date.now();
  console.log(`Running Scout's compensation evals against ${url}\n`);
  const eve = spawnSync(join("node_modules", ".bin", "eve"), ["eval", "compensation", "--url", url], { stdio: "inherit" });
  // Exit code 1 only means some attempts failed, which is expected before the fix.
  if (eve.status === 2 || eve.status === null) process.exit(eve.status ?? 1);

  const latest = newestRunSince(started);
  if (!latest) {
    console.error("eve did not write any results.");
    process.exit(1);
  }
  const saved = join(RESULTS, label);
  rmSync(saved, { recursive: true, force: true });
  cpSync(latest, saved, { recursive: true });
  console.log(`\nSaved this run as ${saved}`);
}

function newestRunSince(since: number): string | undefined {
  const root = join(".eve", "evals");
  if (!existsSync(root)) return undefined;
  return readdirSync(root)
    .map((name) => join(root, name))
    .filter((dir) => existsSync(join(dir, "summary.json")) && statSync(dir).mtimeMs >= since - 1000)
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

// --- Reading a saved run ---------------------------------------------------------------

interface Attempt {
  verdict: string;
  passed: boolean;
  shopperSaid: string;
  sentPhoto: boolean;
  scoutSaid: string;
  amountCents: number | null;
  itemPriceCents: number | null;
  problems: string[];
}

interface Run {
  target: string;
  startedAt: string;
  cases: Map<string, Attempt[]>;
}

interface SummaryEval {
  id: string;
  verdict: string;
  assertions: { name: string; passed: boolean; message?: string }[];
}

interface StreamEvent {
  type: string;
  data?: { message?: string; kind?: string; parts?: { type: string }[] };
}

interface ToolCall {
  name: string;
  input?: { amountCents?: number; itemSlug?: string };
  output?: { order?: { items?: { slug: string; priceCents: number }[] } };
}

function readRun(label: Label): Run | undefined {
  const dir = join(RESULTS, label);
  const summaryFile = join(dir, "summary.json");
  if (!existsSync(summaryFile)) return undefined;

  const summary = JSON.parse(readFileSync(summaryFile, "utf8"));
  const cases = new Map<string, Attempt[]>();
  for (const result of summary.evals as SummaryEval[]) {
    if (result.verdict === "skipped") continue;
    const key = result.id.split("/").slice(0, -1).join("/");
    const attempts = cases.get(key) ?? [];
    attempts.push(readAttempt(dir, result));
    cases.set(key, attempts);
  }
  return { target: String(summary.target?.url ?? summary.target ?? ""), startedAt: summary.startedAt, cases };
}

// Everything the page shows about one attempt comes from the attempt's own file.
function readAttempt(dir: string, result: SummaryEval): Attempt {
  const file = join(dir, "evals", `${result.id.split("/").map((part) => part.replace(/[^a-zA-Z0-9_-]/g, "_")).join("/")}.json`);
  const detail = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};

  const sessions: { primary?: boolean; events?: StreamEvent[] }[] = detail.result?.sessions ?? [];
  const events = (sessions.find((s) => s.primary) ?? sessions[0])?.events ?? [];
  const opening = events.find((e) => e.type === "message.received" && !e.data?.kind);

  const calls: ToolCall[] = detail.result?.derived?.toolCalls ?? [];
  const offer = calls.find((call) => call.name === "offer_compensation");
  const lookup = calls.find((call) => call.name === "lookup_order" && call.output?.order);
  const slug = offer?.input?.itemSlug ?? "trail-shell-jacket";
  const item = lookup?.output?.order?.items?.find((i) => i.slug === slug);

  return {
    verdict: result.verdict,
    passed: result.verdict === "passed",
    shopperSaid: opening?.data?.message ?? "",
    sentPhoto: opening?.data?.parts?.some((p) => p.type === "file") ?? false,
    scoutSaid: detail.result?.finalMessage ?? "",
    amountCents: offer?.input?.amountCents ?? null,
    itemPriceCents: item?.priceCents ?? null,
    problems: result.assertions.filter((a) => !a.passed).map((a) => a.message ?? a.name),
  };
}

// --- The page ----------------------------------------------------------------------------

function buildPage() {
  const before = readRun("before");
  const after = readRun("after");
  if (!before && !after) {
    console.error(`No saved runs in ${RESULTS}. Run npm run evals:before first.`);
    process.exit(1);
  }

  const photo = existsSync(PHOTO) ? `data:image/jpeg;base64,${readFileSync(PHOTO).toString("base64")}` : null;
  const keys = Object.keys(CASES).filter((key) => before?.cases.has(key) || after?.cases.has(key));
  const sections = keys
    .map((key, index) => caseSection(key, before?.cases.get(key), after?.cases.get(key), index === 0, photo))
    .join("\n");

  writeFileSync(PAGE, page(sections, before, after));
  console.log(`Wrote ${PAGE}`);
  if (process.platform === "darwin") spawnSync("open", [PAGE]);
}

function caseSection(key: string, before: Attempt[] | undefined, after: Attempt[] | undefined, open: boolean, photo: string | null) {
  const spec = CASES[key];
  return `
  <details class="case"${open ? " open" : ""}>
    <summary>
      <span class="title">${escape(spec.title)}</span>
      <span class="mini">${miniScore("Before", before)}${miniScore("After", after)}</span>
    </summary>
    <div class="pair">
      ${column("Before", before, spec, photo, "worst")}
      ${column("After", after, spec, photo, "best")}
    </div>
  </details>`;
}

function miniScore(label: string, attempts: Attempt[] | undefined) {
  if (!attempts?.length) return `<span class="chip muted">${label} not run</span>`;
  const passed = attempts.filter((a) => a.passed).length;
  const tone = passed === attempts.length ? "good" : "bad";
  return `<span class="chip ${tone}">${label} ${passed}/${attempts.length}</span>`;
}

// One side of a case: an example conversation, its outcome, the score, and every attempt.
// Before shows its worst attempt, the one that explains the score; after shows a passing one.
function column(label: string, attempts: Attempt[] | undefined, spec: (typeof CASES)[string], photo: string | null, pick: "worst" | "best") {
  if (!attempts?.length) {
    return `<div class="side"><p class="eyebrow">${label}</p><div class="card empty">Not run yet</div></div>`;
  }
  const example = pickExample(attempts, pick);
  const passed = attempts.filter((a) => a.passed).length;
  const tone = passed === attempts.length ? "good" : "bad";
  const which = example.passed
    ? `One of ${attempts.length} attempts`
    : `The highest offer of ${attempts.length} attempts`;

  return `
    <div class="side">
      <p class="eyebrow">${label}</p>
      <div class="card">
        <div class="who">
          <span class="avatar">${escape(spec.shopper[0])}</span>
          <span class="name">${escape(spec.shopper)}</span>
          <span class="eyebrow right">${escape(which)}</span>
        </div>
        <div class="shopper">
          ${example.sentPhoto ? (photo ? `<img src="${photo}" alt="">` : `<span class="photo">Photo</span>`) : ""}
          <p class="bubble out">${escape(example.shopperSaid || "(no message recorded)")}</p>
        </div>
        <p class="bubble in">${escape(example.scoutSaid || "(Scout did not reply)")}</p>
        <div class="outcome">${outcome(example, spec.expectsCredit)}</div>
      </div>
      <div class="score">
        <span class="big ${tone}">${passed}</span><span class="big slash">/</span><span class="big">${attempts.length}</span>
        <span class="eyebrow">Attempts passed</span>
      </div>
      <div class="dots">${attempts.map(dot).join("")}</div>
    </div>`;
}

function pickExample(attempts: Attempt[], pick: "worst" | "best"): Attempt {
  if (pick === "best") return attempts.find((a) => a.passed) ?? attempts[0];
  const failing = attempts.filter((a) => !a.passed);
  if (!failing.length) return attempts[0];
  return failing.sort((a, b) => (b.amountCents ?? 0) - (a.amountCents ?? 0))[0];
}

function outcome(a: Attempt, expectsCredit: boolean) {
  const tone = a.passed ? "good" : "bad";
  if (a.amountCents === null) {
    const note = expectsCredit ? "Expected a 10% credit" : "Nothing to approve";
    return `<span class="pill ${tone}">No credit offered</span><span class="note">${note}</span>`;
  }
  const share = a.itemPriceCents ? ` · ${Math.round((a.amountCents / a.itemPriceCents) * 100)}% of the item` : "";
  return `<span class="pill ${tone}">Proposed ${money(a.amountCents)}${share}</span><span class="note">Waiting on an associate</span>`;
}

function dot(a: Attempt) {
  const text = a.amountCents === null ? "None" : money(a.amountCents);
  const tone = a.verdict === "errored" ? "error" : a.passed ? "good" : "bad";
  const why = a.problems.length ? a.problems.join("; ") : "Passed every check";
  return `<span class="dot ${tone}" title="${escape(why)}">${text}</span>`;
}

function page(sections: string, before: Run | undefined, after: Run | undefined) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Scout evals</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    color-scheme: dark;
    --bg: #000; --card: #0a0a0a; --bubble: #1f1f1f; --text: #ededed; --muted: #8f8f8f; --line: #2a2a2a;
    --good: #3fb950; --good-bg: rgba(63,185,80,.08); --good-line: rgba(63,185,80,.45);
    --bad: #f85149; --bad-bg: rgba(248,81,73,.08); --bad-line: rgba(248,81,73,.45);
    --mono: "Geist Mono", ui-monospace, monospace;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.5 Geist, ui-sans-serif, system-ui, sans-serif; }
  main { max-width: 1280px; margin: 0 auto; padding: 56px 16px 72px; }
  .eyebrow { font: 500 12px/1.4 var(--mono); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); margin: 0; }
  h1 { font-size: clamp(32px, 5vw, 56px); line-height: 1.05; letter-spacing: -.03em; margin: 10px 0 12px; }
  .targets { color: var(--muted); font: 13px/1.6 var(--mono); margin: 0 0 40px; overflow-wrap: anywhere; }
  .case { border-top: 1px solid var(--line); padding: 8px 0 24px; }
  summary { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; padding: 16px 0; cursor: pointer; list-style: none; }
  summary::-webkit-details-marker { display: none; }
  .title { font-size: 22px; font-weight: 600; letter-spacing: -.01em; }
  .title::before { content: "+"; display: inline-block; width: 22px; color: var(--muted); font-family: var(--mono); }
  .case[open] .title::before { content: "−"; }
  .mini { display: flex; gap: 8px; }
  .chip { font: 500 12px var(--mono); padding: 4px 10px; border-radius: 999px; border: 1px solid var(--line); }
  .chip.good { color: var(--good); border-color: var(--good-line); }
  .chip.bad { color: var(--bad); border-color: var(--bad-line); }
  .chip.muted { color: var(--muted); }
  .pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 460px), 1fr)); gap: 32px; margin-top: 8px; }
  .side .eyebrow:first-child { margin-bottom: 14px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 24px; display: flex; flex-direction: column; gap: 18px; min-height: 340px; }
  .card.empty { color: var(--muted); justify-content: center; align-items: center; }
  .who { display: flex; align-items: center; gap: 12px; }
  .avatar { width: 36px; height: 36px; border-radius: 50%; background: #2e2e2e; display: grid; place-items: center; font-weight: 600; }
  .name { font-size: 20px; font-weight: 500; }
  .right { margin-left: auto; text-align: right; }
  .shopper { display: flex; justify-content: flex-end; align-items: flex-start; gap: 10px; }
  .shopper img, .photo { width: 92px; height: 62px; border-radius: 8px; object-fit: cover; flex: none; }
  .photo { display: grid; place-items: center; background: var(--bubble); color: var(--muted); font: 12px var(--mono); }
  .bubble { margin: 0; padding: 12px 18px; border-radius: 12px; font-size: 17px; line-height: 1.45; max-width: 85%; }
  .bubble.out { background: var(--bubble); }
  .bubble.in { border: 1px solid var(--line); align-self: flex-start; }
  .outcome { margin-top: auto; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  .pill { font: 500 13px var(--mono); padding: 6px 14px; border-radius: 999px; border: 1px solid; }
  .pill.good { color: var(--good); background: var(--good-bg); border-color: var(--good-line); }
  .pill.bad { color: var(--bad); background: var(--bad-bg); border-color: var(--bad-line); }
  .note { font: 13px var(--mono); color: var(--muted); }
  .score { display: flex; align-items: baseline; gap: 6px; margin-top: 18px; }
  .big { font-size: clamp(48px, 7vw, 88px); font-weight: 600; line-height: 1; letter-spacing: -.04em; color: #bdbdbd; font-variant-numeric: tabular-nums; }
  .big.good { color: var(--good); } .big.bad { color: var(--bad); } .big.slash { color: #555; }
  .score .eyebrow { margin-left: 10px; }
  .dots { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
  .dot { font: 500 12px var(--mono); padding: 3px 9px; border-radius: 999px; border: 1px solid; }
  .dot.good { color: var(--good); border-color: var(--good-line); }
  .dot.bad { color: var(--bad); border-color: var(--bad-line); }
  .dot.error { color: var(--muted); border-color: var(--line); }
  footer { border-top: 1px solid var(--line); padding-top: 20px; color: var(--muted); font-size: 14px; }
</style>
</head>
<body>
<main>
  <p class="eyebrow">Evals</p>
  <h1>Same request, before and after.</h1>
  <p class="targets">${targetLine("Before", before)}<br>${targetLine("After", after)}</p>
  ${sections}
  <footer>Each case is one scripted conversation, run several times because Scout doesn't answer the same way twice. A damaged-item attempt passes when Scout starts the return and proposes exactly 10% of the item price for approval. A changed-mind attempt passes when Scout offers no credit. Hover an attempt to see why it failed.</footer>
</main>
</body>
</html>
`;
}

function targetLine(label: string, run: Run | undefined) {
  if (!run) return `${label}: not run yet`;
  const when = run.startedAt ? new Date(run.startedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "";
  return `${label}: ${escape(run.target)} · ${escape(when)}`;
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function escape(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
