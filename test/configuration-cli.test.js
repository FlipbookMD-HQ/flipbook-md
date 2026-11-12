import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function fixture(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "flipbook-md-"));
  try { await fn(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

function runFlipbook(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(repo, "bin/flipbook.js"), ...args], { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("the CLI refuses a video export that has no duration", async () => fixture(async (dir) => {
  await fs.writeFile(path.join(dir, "talk.slide.md"), "# One\n\n---\n\n# Two\n");
  const result = await runFlipbook(["export", ".", "--format", "video"], dir);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /duration/);
}));

test("the CLI treats the path as optional and names a flag it cannot read", async () => fixture(async (dir) => {
  await fs.writeFile(path.join(dir, "talk.slide.md"), "# One\n\n---\n\n# Two\n");
  const noPath = await runFlipbook(["export", "--format", "video"], dir);
  assert.equal(noPath.code, 1);
  assert.match(noPath.stderr, /needs a duration/);
  assert.doesNotMatch(noPath.stderr, /Path does not exist/);
  const noValue = await runFlipbook(["export", ".", "--format"], dir);
  assert.equal(noValue.code, 1);
  assert.match(noValue.stderr, /--format needs a value/);
  const flagAsValue = await runFlipbook(["export", "--duration", "--format", "video"], dir);
  assert.match(flagAsValue.stderr, /--duration needs a value/);
  const typo = await runFlipbook(["export", ".", "--transtion", "fade"], dir);
  assert.equal(typo.code, 1);
  assert.match(typo.stderr, /Unknown option: --transtion/);
  const negative = await runFlipbook(["export", ".", "--format", "video", "--duration", "-5"], dir);
  assert.match(negative.stderr, /greater than 0/);
}));
