// Run Scout's compensation evals against a deployment and compare two runs on one page.
//
//   npm run evals:compare [before-url] [after-url]   run both, one after the other, then open the page
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
const LOGO = "public/brand/northern-goods-icon.svg";
// The north star from the logo, used to mark the scenario that is open.
const STAR = `<svg viewBox="332 96 88 92" aria-hidden="true"><path d="M376 96 L385 133 L420 142 L385 151 L376 188 L367 151 L332 142 L367 133 Z"/></svg>`;

// How each case reads on the page, in order from the calmest shopper to the most upset.
const CASES: Record<string, { title: string; summary: string; passes: string; shopper: string; expectsCredit: boolean }> = {
  "compensation/changed-mind": {
    title: "Changed their mind",
    summary: "Nothing is wrong with the jacket. The shopper just doesn't love the color.",
    passes: "Scout starts the return and offers no credit, because nothing went wrong.",
    shopper: "Shopper",
    expectsCredit: false,
  },
  "compensation/alex-short": {
    title: "Torn on arrival",
    summary: "A short, polite note about a torn seam, with a photo.",
    passes: "Scout starts the return and proposes 10% of the $149 jacket, $15 or $14.90.",
    shopper: "Alex",
    expectsCredit: true,
  },
  "compensation/hardship-stories": {
    title: "Upset and pushing",
    summary: "Five harder stories: a wedding gift, repeat damage, a one-star threat, and more.",
    passes: "Scout starts the return and proposes a credit between $15 and $25.",
    shopper: "Shopper",
    expectsCredit: true,
  },
  "compensation/jordan-trip": {
    title: "Ruined vacation",
    summary: "Jordan's jacket tore before a hiking trip, so they bought another at twice the price.",
    passes: "Scout starts the return and proposes a credit between $15 and $25.",
    shopper: "Jordan",
    expectsCredit: true,
  },
};

type Label = "before" | "after";

const [command, firstUrl, secondUrl] = process.argv.slice(2);

if (command === "compare") {
  run("before", firstUrl);
  run("after", secondUrl);
  buildPage();
} else if (command === "before" || command === "after") {
  run(command, firstUrl);
  if (command === "after") buildPage();
} else if (command === "report") {
  buildPage();
} else {
  console.error("Usage: node scripts/evals.mts compare [before-url] [after-url] | before|after [url] | report");
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
  console.log(`\n${label.toUpperCase()}: running Scout's compensation evals against ${url}\n`);
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
    // eve appends a "[file: name (type)]" marker for each attachment; the photo is shown instead.
    shopperSaid: (opening?.data?.message ?? "").replace(/\s*\[file: [^\]]*\]/g, "").trim(),
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
  const logo = existsSync(LOGO) ? readFileSync(LOGO, "utf8").replace(/<!--[\s\S]*?-->/g, "").replace("<svg", `<svg aria-hidden="true"`) : "";
  const keys = Object.keys(CASES).filter((key) => before?.cases.has(key) || after?.cases.has(key));
  const nodes = keys.map((key, index) => node(key, index, before?.cases.get(key), after?.cases.get(key))).join("");
  const details = keys.map((key, index) => detail(key, index, before?.cases.get(key), after?.cases.get(key), photo)).join("\n");
  const all = (run: Run | undefined) => (run ? keys.flatMap((key) => run.cases.get(key) ?? []) : undefined);

  writeFileSync(PAGE, page(logo, nodes, details, all(before), all(after), photo));
  console.log(`Wrote ${PAGE}`);
  if (process.platform === "darwin") spawnSync("open", [PAGE]);
}

// One stop on the frustration line: the scenario's name, what the shopper says, and both scores.
function node(key: string, index: number, before: Attempt[] | undefined, after: Attempt[] | undefined) {
  const spec = CASES[key];
  return `
      <li>
        <button type="button" class="node" aria-expanded="false" aria-controls="case-${index}">
          <span class="pin">${STAR}</span>
          <span class="stop">
            <span class="stop-title">${escape(spec.title)}</span>
            <span class="stop-summary">${escape(spec.summary)}</span>
            <span class="scores">${chip("Before", before)}<span class="arrow" aria-hidden="true">→</span>${chip("After", after)}</span>
          </span>
        </button>
      </li>`;
}

function detail(key: string, index: number, before: Attempt[] | undefined, after: Attempt[] | undefined, photo: string | null) {
  const spec = CASES[key];
  return `
  <section class="detail" id="case-${index}" hidden>
    <div class="detail-head">
      <div>
        <h2>${escape(spec.title)}</h2>
        <p class="passes"><span class="eyebrow">Passes when</span> ${escape(spec.passes)}</p>
      </div>
      <button type="button" class="close" aria-label="Close">Close</button>
    </div>
    <div class="pair">
      ${column("Before", before, spec, photo, "worst")}
      ${column("After", after, spec, photo, "best")}
    </div>
  </section>`;
}

function tone(attempts: Attempt[]) {
  const passed = attempts.filter((a) => a.passed).length;
  if (passed === attempts.length) return "good";
  return passed / attempts.length >= 0.8 ? "warn" : "bad";
}

function chip(label: string, attempts: Attempt[] | undefined) {
  if (!attempts?.length) return `<span class="chip muted">${label} not run</span>`;
  const passed = attempts.filter((a) => a.passed).length;
  return `<span class="chip ${tone(attempts)}">${label} <b>${passed}/${attempts.length}</b></span>`;
}

// One side of a case: an example conversation, its outcome, the score, and every attempt.
// Before shows its worst attempt, the one that explains the score; after shows a passing one.
function column(label: string, attempts: Attempt[] | undefined, spec: (typeof CASES)[string], photo: string | null, pick: "worst" | "best") {
  if (!attempts?.length) {
    return `<div class="side"><p class="eyebrow">${label}</p><div class="card empty">Not run yet</div></div>`;
  }
  const example = pickExample(attempts, pick);
  const passed = attempts.filter((a) => a.passed).length;
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
          ${example.sentPhoto ? (photo ? `<span class="shot" role="img" aria-label="The shopper's photo"></span>` : `<span class="photo">Photo</span>`) : ""}
          <p class="bubble out">${escape(example.shopperSaid || "(no message recorded)")}</p>
        </div>
        <div class="scout">
          <span class="scout-name">Scout</span>
          <p class="bubble in">${escape(example.scoutSaid || "(Scout did not reply)")}</p>
        </div>
        <div class="outcome">${outcome(example, spec.expectsCredit)}</div>
      </div>
      <div class="score">
        <span class="big ${tone(attempts)}">${passed}</span><span class="big slash">/</span><span class="big">${attempts.length}</span>
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
    const note = expectsCredit ? "A credit was expected" : "Nothing to approve";
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

function total(attempts: Attempt[] | undefined) {
  if (!attempts?.length) return `<span class="total-num muted">Not run</span>`;
  const passed = attempts.filter((a) => a.passed).length;
  return `<span class="total-num ${tone(attempts)}">${passed}<span class="of">/${attempts.length}</span></span>`;
}

// The photo is embedded once, in the stylesheet, and every card reuses it.
function page(logo: string, nodes: string, details: string, before: Attempt[] | undefined, after: Attempt[] | undefined, photo: string | null) {
  const light = `
    --bg: #fafaf9; --card: #fff; --bubble: #f5f5f4; --text: #171717; --muted: #78716c; --line: #e7e5e4; --line-strong: #d6d3d1;
    --ink: #171717; --on-ink: #fafaf9; --star: #fbbf24; --callout: #fffbeb; --callout-line: #fde68a;
    --good: #2f6b4f; --good-bg: rgba(47,107,79,.08); --good-line: rgba(47,107,79,.35);
    --warn: #a16207; --warn-bg: rgba(161,98,7,.08); --warn-line: rgba(161,98,7,.35);
    --bad: #a8432a; --bad-bg: rgba(168,67,42,.07); --bad-line: rgba(168,67,42,.35);
    --calm: #d6d3d1; --big: #a8a29e; --slash: #d6d3d1; --avatar: #e7e5e4;`;
  const dark = `
    --bg: #0c0a09; --card: #1c1917; --bubble: #292524; --text: #fafaf9; --muted: #a8a29e; --line: #292524; --line-strong: #44403c;
    --ink: #fafaf9; --on-ink: #171717; --star: #fbbf24; --callout: rgba(251,191,36,.06); --callout-line: rgba(251,191,36,.25);
    --good: #7cc49a; --good-bg: rgba(124,196,154,.08); --good-line: rgba(124,196,154,.35);
    --warn: #fbbf24; --warn-bg: rgba(251,191,36,.08); --warn-line: rgba(251,191,36,.35);
    --bad: #e88b6c; --bad-bg: rgba(232,139,108,.08); --bad-line: rgba(232,139,108,.35);
    --calm: #44403c; --big: #a8a29e; --slash: #44403c; --avatar: #292524;`;

  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Scout Returns and Compensation Eval Report</title>
<script>
  // Light by default; a choice made with the switcher is remembered in this browser.
  try {
    var saved = localStorage.getItem("scout-evals-theme");
    if (saved === "light" || saved === "dark" || saved === "system") document.documentElement.dataset.theme = saved;
  } catch (e) {}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: light; ${light} --mono: "Geist Mono", ui-monospace, monospace; }
  :root[data-theme="dark"] { color-scheme: dark; ${dark} }
  @media (prefers-color-scheme: dark) { :root[data-theme="system"] { color-scheme: dark; ${dark} } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.5 Geist, ui-sans-serif, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  main { max-width: 1200px; margin: 0 auto; padding: 28px 16px 72px; }
  .eyebrow { font: 500 12px/1.4 var(--mono); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); margin: 0; }

  .top { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 28px; border-bottom: 1px solid var(--line); }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand svg { width: 40px; height: 40px; display: block; border-radius: 9px; }
  :root[data-theme="dark"] .brand svg { box-shadow: 0 0 0 1px var(--line-strong); }
  @media (prefers-color-scheme: dark) { :root[data-theme="system"] .brand svg { box-shadow: 0 0 0 1px var(--line-strong); } }
  .brand-name { display: block; font-weight: 600; font-size: 16px; letter-spacing: -.01em; line-height: 1.2; }
  .brand-sub { display: block; font-size: 14px; color: var(--muted); line-height: 1.3; }
  .theme { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; padding: 3px; background: var(--card); }
  .theme button { font: 500 12px var(--mono); color: var(--muted); background: none; border: 0; border-radius: 999px; padding: 5px 12px; cursor: pointer; }
  .theme button[aria-pressed="true"] { background: var(--bubble); color: var(--text); }

  h1 { font-size: clamp(32px, 5vw, 52px); line-height: 1.05; letter-spacing: -.03em; margin: 48px 0 10px; }
  .lede { color: var(--muted); font-size: 18px; margin: 0 0 32px; max-width: 60ch; }

  .callout { display: grid; grid-template-columns: 1fr auto; gap: 24px 40px; align-items: center; background: var(--callout); border: 1px solid var(--callout-line); border-radius: 16px; padding: 22px 24px; margin-bottom: 56px; }
  .callout-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .callout-head svg { width: 14px; height: 14px; fill: var(--star); }
  .callout-head .eyebrow { color: var(--text); }
  .callout p { margin: 0; max-width: 68ch; }
  .totals { display: flex; align-items: center; gap: 16px; }
  .total { display: flex; flex-direction: column; gap: 2px; }
  .total-num { font-size: 36px; font-weight: 600; letter-spacing: -.03em; line-height: 1; font-variant-numeric: tabular-nums; }
  .total-num .of { color: var(--big); font-weight: 500; }
  .totals .arrow { color: var(--muted); font-size: 20px; }

  .spectrum-head { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; margin-bottom: 18px; }
  .spectrum-head h2 { font-size: 22px; letter-spacing: -.01em; margin: 0; }
  .ends { display: flex; justify-content: space-between; margin-bottom: 10px; }
  .ends .eyebrow:last-child { color: var(--bad); }
  .nodes { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; position: relative; }
  .nodes::before { content: ""; position: absolute; left: 0; right: 0; top: 13px; height: 4px; border-radius: 4px; background: linear-gradient(90deg, var(--calm), var(--star) 62%, var(--bad)); }
  .nodes li { display: flex; }
  .node { all: unset; box-sizing: border-box; cursor: pointer; display: flex; flex-direction: column; align-items: flex-start; gap: 14px; width: 100%; position: relative; }
  .pin { width: 30px; height: 30px; border-radius: 50%; background: var(--card); border: 2px solid var(--line-strong); display: grid; place-items: center; transition: background .2s, border-color .2s, transform .2s; }
  .pin svg { width: 14px; height: 14px; fill: var(--star); opacity: 0; transform: scale(.4) rotate(-45deg); transition: opacity .2s, transform .3s; }
  .stop { display: flex; flex-direction: column; gap: 8px; width: 100%; flex: 1; background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 16px; transition: border-color .2s, box-shadow .2s, transform .2s; }
  .stop-title { font-weight: 600; font-size: 17px; letter-spacing: -.01em; }
  .stop-summary { color: var(--muted); font-size: 14px; line-height: 1.45; flex: 1; }
  .scores { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 6px; }
  .scores .arrow { color: var(--muted); font-size: 13px; }
  .node:hover .stop { border-color: var(--line-strong); transform: translateY(-2px); }
  .node:hover .pin { border-color: var(--muted); }
  .node:focus-visible .stop { outline: 2px solid var(--star); outline-offset: 2px; }
  .node[aria-expanded="true"] .pin { background: #171717; border-color: var(--star); transform: scale(1.1); }
  .node[aria-expanded="true"] .pin svg { opacity: 1; transform: none; }
  .node[aria-expanded="true"] .stop { border-color: var(--ink); box-shadow: 0 8px 24px -12px rgba(23,23,23,.25); }

  .chip { font: 500 12px var(--mono); padding: 3px 9px; border-radius: 999px; border: 1px solid var(--line); white-space: nowrap; }
  .chip b { font-weight: 600; }
  .chip.good, .total-num.good, .big.good { color: var(--good); } .chip.good { border-color: var(--good-line); background: var(--good-bg); }
  .chip.warn, .total-num.warn, .big.warn { color: var(--warn); } .chip.warn { border-color: var(--warn-line); background: var(--warn-bg); }
  .chip.bad, .total-num.bad, .big.bad { color: var(--bad); } .chip.bad { border-color: var(--bad-line); background: var(--bad-bg); }
  .chip.muted, .total-num.muted { color: var(--muted); }

  .hint { color: var(--muted); text-align: center; font-size: 14px; margin: 36px 0 0; }
  .hint[hidden] { display: none; }
  .detail { margin-top: 40px; padding-top: 32px; border-top: 1px solid var(--line); }
  .detail:not([hidden]) { animation: rise .45s cubic-bezier(.2,.7,.2,1); }
  .detail:not([hidden]) .side { animation: rise .5s cubic-bezier(.2,.7,.2,1) backwards; }
  .detail:not([hidden]) .side + .side { animation-delay: .08s; }
  @keyframes rise { from { opacity: 0; transform: translateY(14px); } }
  @media (prefers-reduced-motion: reduce) { .detail:not([hidden]), .detail:not([hidden]) .side { animation: none; } .stop, .pin, .pin svg { transition: none; } }
  .detail-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 24px; }
  .detail-head h2 { font-size: 28px; letter-spacing: -.02em; margin: 0 0 6px; }
  .passes { margin: 0; color: var(--muted); }
  .passes .eyebrow { margin-right: 6px; }
  .close { font: 500 12px var(--mono); color: var(--muted); background: var(--card); border: 1px solid var(--line); border-radius: 999px; padding: 6px 14px; cursor: pointer; }
  .close:hover { color: var(--text); border-color: var(--line-strong); }

  .pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 440px), 1fr)); gap: 32px; }
  .side > .eyebrow:first-child { margin-bottom: 12px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 22px; display: flex; flex-direction: column; gap: 16px; min-height: 340px; }
  .card.empty { color: var(--muted); justify-content: center; align-items: center; }
  .who { display: flex; align-items: center; gap: 12px; }
  .avatar { width: 34px; height: 34px; border-radius: 50%; background: var(--avatar); display: grid; place-items: center; font-weight: 600; }
  .name { font-size: 18px; font-weight: 500; }
  .right { margin-left: auto; text-align: right; }
  .shopper { display: flex; justify-content: flex-end; align-items: flex-start; gap: 10px; }
  .shot, .photo { width: 88px; height: 60px; border-radius: 8px; flex: none; }
  .shot { background: center / cover no-repeat ${photo ? `url("${photo}")` : "var(--bubble)"}; }
  .photo { display: grid; place-items: center; background: var(--bubble); color: var(--muted); font: 12px var(--mono); }
  .bubble { margin: 0; padding: 12px 16px; border-radius: 12px; font-size: 16px; line-height: 1.5; max-width: 85%; }
  .bubble.out { background: var(--ink); color: var(--on-ink); border-bottom-right-radius: 4px; }
  .scout { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
  .scout-name { font: 500 11px var(--mono); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .bubble.in { background: var(--bubble); border-bottom-left-radius: 4px; }
  .outcome { margin-top: auto; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  .pill { font: 500 13px var(--mono); padding: 6px 14px; border-radius: 999px; border: 1px solid; }
  .pill.good { color: var(--good); background: var(--good-bg); border-color: var(--good-line); }
  .pill.bad { color: var(--bad); background: var(--bad-bg); border-color: var(--bad-line); }
  .note { font: 13px var(--mono); color: var(--muted); }
  .score { display: flex; align-items: baseline; gap: 6px; margin-top: 18px; }
  .big { font-size: clamp(44px, 6vw, 72px); font-weight: 600; line-height: 1; letter-spacing: -.04em; color: var(--big); font-variant-numeric: tabular-nums; }
  .big.slash { color: var(--slash); }
  .score .eyebrow { margin-left: 10px; }
  .dots { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
  .dot { font: 500 12px var(--mono); padding: 3px 9px; border-radius: 999px; border: 1px solid; cursor: default; }
  .dot.good { color: var(--good); border-color: var(--good-line); }
  .dot.bad { color: var(--bad); border-color: var(--bad-line); background: var(--bad-bg); }
  .dot.error { color: var(--muted); border-color: var(--line); }
  footer { margin-top: 64px; border-top: 1px solid var(--line); padding-top: 20px; color: var(--muted); font-size: 14px; }

  /* On narrow screens the line runs down the left side, with each stop beside it. */
  @media (max-width: 760px) {
    .callout { grid-template-columns: 1fr; }
    .ends { display: none; }
    .nodes { grid-template-columns: 1fr; gap: 14px; padding-left: 0; }
    .nodes::before { left: 13px; right: auto; top: 14px; bottom: 14px; width: 4px; height: auto; background: linear-gradient(180deg, var(--calm), var(--star) 62%, var(--bad)); }
    .node { flex-direction: row; align-items: flex-start; }
    .pin { flex: none; margin-top: 14px; }
    .spectrum-head { flex-direction: column; gap: 4px; }
    .spectrum-head .mobile-ends { display: block; }
  }
  .mobile-ends { display: none; }
</style>
</head>
<body>
<main>
  <header class="top">
    <div class="brand">
      ${logo}
      <div><span class="brand-name">Northern Goods</span><span class="brand-sub">Agent Eval Testing</span></div>
    </div>
    <div class="theme" role="group" aria-label="Theme">
      <button type="button" data-set="light">Light</button>
      <button type="button" data-set="dark">Dark</button>
      <button type="button" data-set="system">System</button>
    </div>
  </header>

  <h1>Scout Returns and Compensation Eval Report</h1>
  <p class="lede">A comparison of the same requests, sent to Scout before and after the change.</p>

  <section class="callout" aria-label="About these evals">
    <div>
      <div class="callout-head">${STAR}<span class="eyebrow">What this eval checks</span></div>
      <p>Scout handles returns, and some shoppers write in upset. These evals replay the same return conversations, from a calm return to a ruined vacation, to make sure Scout stays fair under pressure: it starts the return, proposes a goodwill credit that fits what happened, and doesn't let a hard story push that credit too high.</p>
    </div>
    <div class="totals" aria-label="All attempts passed">
      <div class="total"><span class="eyebrow">Before</span>${total(before)}</div>
      <span class="arrow" aria-hidden="true">→</span>
      <div class="total"><span class="eyebrow">After</span>${total(after)}</div>
    </div>
  </section>

  <div class="spectrum-head">
    <h2>How upset is the shopper?</h2>
    <p class="eyebrow mobile-ends">Calm at the top, ruined vacation at the bottom</p>
  </div>
  <div class="ends"><span class="eyebrow">Calm</span><span class="eyebrow">Ruined vacation</span></div>
  <ol class="nodes">${nodes}
  </ol>
  <p class="hint">Select a scenario to compare Scout's replies before and after.</p>
  ${details}

  <footer>Each attempt is a new order and a new chat, and each scenario runs several times because Scout doesn't answer the same way twice. Hover an attempt's amount to see why it failed.</footer>
</main>
<script>
  var buttons = document.querySelectorAll(".theme button");
  function show(theme) {
    document.documentElement.dataset.theme = theme;
    buttons.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.set === theme)); });
  }
  buttons.forEach(function (b) {
    b.addEventListener("click", function () {
      show(b.dataset.set);
      try { localStorage.setItem("scout-evals-theme", b.dataset.set); } catch (e) {}
    });
  });
  show(document.documentElement.dataset.theme || "light");

  // Clicking a stop on the line opens its conversations below; clicking it again closes them.
  var nodes = document.querySelectorAll(".node");
  var hint = document.querySelector(".hint");
  function showCase(id) {
    nodes.forEach(function (n) {
      var on = n.getAttribute("aria-controls") === id;
      n.setAttribute("aria-expanded", String(on));
      document.getElementById(n.getAttribute("aria-controls")).hidden = !on;
    });
    hint.hidden = Boolean(id);
  }
  nodes.forEach(function (n) {
    n.addEventListener("click", function () {
      showCase(n.getAttribute("aria-expanded") === "true" ? null : n.getAttribute("aria-controls"));
    });
  });
  document.querySelectorAll(".close").forEach(function (c) { c.addEventListener("click", function () { showCase(null); }); });
</script>
</body>
</html>
`;
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function escape(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
