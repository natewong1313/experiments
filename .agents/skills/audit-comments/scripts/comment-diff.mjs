#!/usr/bin/env node
// Deterministically list every TypeScript comment on ADDED lines of the
// (unstaged) diff. Run from the repo root.
// Usage: node comment-diff.mjs [--staged] [--json] [path-filter...]
// Parser setup (once): npm i --prefix ~/.cache/audit-comments typescript@^5
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const scriptRequire = createRequire(import.meta.url);
const cwdRequire = createRequire(resolve("./noop.js"));

// TypeScript 7 (the Go-based compiler) exposes no JS API, so require a v5 that has createScanner.
function loadTypeScript() {
  const candidates = [
    ["project", () => cwdRequire("typescript")],
    ["skill scripts dir", () => scriptRequire("typescript")],
    ["~/.cache/audit-comments", () => scriptRequire(resolve(homedir(), ".cache/audit-comments/node_modules/typescript"))],
  ];
  for (const [from, load] of candidates) {
    try {
      const ts = load();
      if (typeof ts.createScanner === "function") return ts;
      console.error(`typescript resolved from ${from} has no JS API (likely v7); trying other locations.`);
    } catch {}
  }
  console.error("No usable TypeScript parser found. Run once:\n  npm i --prefix ~/.cache/audit-comments typescript@^5");
  process.exit(1);
}
const ts = loadTypeScript();

const args = process.argv.slice(2);
const staged = args.includes("--staged");
const asJson = args.includes("--json");
const filters = args.filter((a) => a !== "--staged" && a !== "--json");

const diffArgs = ["diff", "--unified=0", "--no-color", "--", "*.ts", "*.tsx", "*.mts", "*.cts", "*.d.ts"];
if (staged) diffArgs.splice(1, 0, "--cached");
if (filters.length) diffArgs.push(...filters);
const diff = execSync(`git ${diffArgs.map((a) => JSON.stringify(a)).join(" ")}`, {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
if (!diff) process.exit(0);

// Parse hunk headers to map each "+" line to a 1-based new-file line number.
// @@ -oldStart,oldCount +newStart,newCount @@
const perFile = new Map(); // file -> Set<number> of added 1-based lines
let currentFile = null;
let newLine = 0;
for (const line of diff.split("\n")) {
  if (line.startsWith("+++ ")) {
    currentFile = line.slice(4).replace(/^b\//, "");
    continue;
  }
  if (!currentFile) continue;
  if (line.startsWith("@@")) {
    const m = /^\+(-?\d+)(?:,(\d+))?/.exec(line.replace(/^@@ -\d+(?:,\d+)? /, ""));
    newLine = parseInt(m[1], 10);
    if (newLine === 0) newLine = 1; // zero-context hunk starting at line 0 means line 1
    continue;
  }
  if (line.startsWith("+")) {
    if (!perFile.has(currentFile)) perFile.set(currentFile, new Set());
    perFile.get(currentFile).add(newLine);
    newLine++;
  } else if (line.startsWith(" ")) {
    // context lines only appear with context; deletions don't advance the new-file counter
    newLine++;
  }
}

function commentRanges(text) {
  const scanner = ts.createScanner(ts.ScriptKind.TS, /*skipTrivia*/ false, ts.LanguageVariant.Standard, text);
  const ranges = [];
  for (;;) {
    const tok = scanner.scan();
    if (tok === ts.SyntaxKind.EndOfFileToken) break;
    if (tok === ts.SyntaxKind.SingleLineCommentTrivia || tok === ts.SyntaxKind.MultiLineCommentTrivia) {
      ranges.push([scanner.getTokenPos(), scanner.getTokenEnd()]);
    }
  }
  return ranges;
}

function lineOf(offset, lineStarts) {
  // binary search: last lineStart <= offset
  let lo = 0,
    hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo; // 0-based
}

const results = [];
for (const [file, addedLines] of perFile) {
  if (!existsSync(file)) continue; // deleted in the diff
  const text = readFileSync(file, "utf8");
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lineStarts.push(i + 1);
  for (const [start, end] of commentRanges(text)) {
    const startLine = lineOf(start, lineStarts);
    const endLine = lineOf(end - 1, lineStarts);
    for (const ln of addedLines) {
      if (ln >= startLine + 1 && ln <= endLine + 1) {
        const comment = text.slice(start, end).split("\n").map((s) => s.trim());
        results.push({ file, line: ln, comment });
        break;
      }
    }
  }
}

if (asJson) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const r of results) console.log(`${r.file}:${r.line}: ${r.comment.join(" ")}`);
}
