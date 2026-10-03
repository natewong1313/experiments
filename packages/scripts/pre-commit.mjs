#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

// Pre-commit hook: format staged files with oxfmt, then lint them with oxlint.
// Each file is linted from its nearest workspace directory, so per-workspace
// `.oxlintrc.json` configs and the workspace's own lint flags are honoured.

const FORMAT_EXTENSIONS = new Set([".ts", ".tsx", ".md"]);
const LINT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);

const root = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" });
const rootPath = root.stdout.trim();
if (root.status !== 0 || !rootPath) {
  console.error("pre-commit: not inside a git repository");
  process.exit(1);
}

const binPath = path.join(rootPath, "node_modules", ".bin");
const env = { ...process.env, PATH: `${binPath}${path.delimiter}${process.env.PATH}` };

function git(args) {
  const result = spawnSync("git", args, { cwd: rootPath, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0 || result.error) {
    console.error(`pre-commit: git ${args[0]} failed`);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout.toString();
}

const staged = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"])
  .split("\0")
  .filter(Boolean)
  .filter((file) => existsSync(path.join(rootPath, file)));

const formatFiles = staged.filter((file) => FORMAT_EXTENSIONS.has(path.extname(file)));
const lintFiles = staged.filter((file) => LINT_EXTENSIONS.has(path.extname(file)));

if (formatFiles.length === 0 && lintFiles.length === 0) process.exit(0);

// Files with unstaged edits: re-adding them after formatting would stage work
// the author did not intend to commit.
const mixedStaged = new Set(git(["diff", "--name-only", "-z", "--", ...formatFiles]).split("\0").filter(Boolean));

const format = spawnSync("oxfmt", ["--write", ...formatFiles], { cwd: rootPath, env, stdio: "inherit" });
if (format.status !== 0 || format.error) {
  console.error("pre-commit: oxfmt failed");
  process.exit(format.status ?? 1);
}

const reformatted = git(["diff", "--name-only", "-z", "--", ...formatFiles]).split("\0").filter(Boolean);
if (reformatted.length > 0) {
  git(["add", "--", ...reformatted]);
  console.log(`pre-commit: oxfmt reformatted ${reformatted.length} staged file(s)`);
  for (const file of reformatted) {
    if (mixedStaged.has(file)) console.warn(`pre-commit: warning: ${file} had unstaged changes that are now staged`);
  }
}

function nearestWorkspace(file) {
  let directory = path.dirname(path.resolve(rootPath, file));
  while (directory !== rootPath && directory !== path.dirname(directory)) {
    if (existsSync(path.join(directory, "package.json"))) return directory;
    directory = path.dirname(directory);
  }
  return rootPath;
}

const byWorkspace = new Map();
for (const file of lintFiles) {
  const workspace = nearestWorkspace(file);
  const files = byWorkspace.get(workspace) ?? [];
  files.push(file);
  byWorkspace.set(workspace, files);
}

let failed = false;
for (const [workspace, files] of [...byWorkspace].sort(([a], [b]) => a.localeCompare(b))) {
  const manifest = JSON.parse(readFileSync(path.join(workspace, "package.json"), "utf8"));
  const lintScript = manifest.scripts?.lint;
  if (!lintScript) continue; // workspace is not linted by `pnpm lint`; skip it here too

  const args = ["--deny-warnings"];
  if (lintScript.includes("--type-aware")) args.push("--type-aware");

  const relative = files.map((file) => path.relative(workspace, path.resolve(rootPath, file)));
  console.log(`pre-commit: oxlint ${path.relative(rootPath, workspace) || "."} (${relative.length} file(s))`);
  const lint = spawnSync("oxlint", [...args, ...relative], { cwd: workspace, env, stdio: "inherit" });
  if (lint.status !== 0 || lint.error) failed = true;
}

process.exit(failed ? 1 : 0);
