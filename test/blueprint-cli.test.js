import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { check, exportSlides, show } from "../src/cli.js";

const bin = path.resolve("bin/flipbook.js");
const talkBlueprint = `pages:
  - type: cover
  - type: point
    repeat:
      min: 3
      max: 6
  - type: conclusion
types:
  cover:
    template: cover
  point:
    allow: [heading, paragraph, list]
    forbid: [code]
  conclusion:
    template: summary
    allow: [heading, paragraph]
    max_chars: 250
`;

async function fixture(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "flipbook-md-"));
  try { await fn(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

async function writeDeck(dir, slides, blueprint = talkBlueprint) {
  await fs.mkdir(path.join(dir, "slides"), { recursive: true });
  const names = Object.keys(slides);
  await fs.writeFile(path.join(dir, "presentation.yml"), `title: Talk\nslides:\n${names.map((name) => `  - ${name}\n`).join("")}`);
  if (blueprint) await fs.writeFile(path.join(dir, "blueprint.yml"), blueprint);
  for (const [name, body] of Object.entries(slides)) {
    await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await fs.writeFile(path.join(dir, name), body);
  }
}

function passingSlides(conclusion = "# End\n\nDone.\n") {
  return {
    "slides/01_cover.slide.md": "<!-- type: conclusion -->\n# Cover\n\nOpen.\n",
    "slides/02_point.slide.md": "# One\n\n- a\n",
    "slides/03_point.slide.md": "# Two\n\nText.\n",
    "slides/04_point.slide.md": "# Three\n\nText.\n",
    "slides/05_conclusion.slide.md": conclusion
  };
}

test("flipbook check gates show and export", async () => fixture(async dir => {
  const logs = [];
  const original = console.log;
  console.log = (...args) => logs.push(args.join(" "));
  try {
    await writeDeck(dir, { "slides/01-intro.md": "# Hello\n" }, null);
    const open = await check(dir);
    assert.equal(open.blueprint, null);
    assert.match(logs.join("\n"), /no blueprint/);

    logs.length = 0;
    await writeDeck(dir, passingSlides());
    const matched = await check(dir);
    assert.equal(matched.slides.length, 5);
    assert.match(logs.join("\n"), /5 slide\(s\) match the blueprint/);
  } finally {
    console.log = original;
  }

  await writeDeck(dir, passingSlides(`# Hi\n\n${"a".repeat(249)}\n`));
  const failed = spawnSync(process.execPath, [bin, "check", dir], { encoding: "utf8" });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /visible text is 251 characters; maximum is 250/);
  assert.doesNotMatch(failed.stdout, /Open:/);

  const help = spawnSync(process.execPath, [bin, "--help"], { encoding: "utf8" });
  assert.match(help.stdout, /flipbook check/);

  const showLogs = [];
  console.log = (...args) => showLogs.push(args.join(" "));
  try {
    await assert.rejects(() => show(dir), /maximum is 250/);
  } finally {
    console.log = original;
  }
  assert.equal(showLogs.some((line) => line.includes("Open:")), false);

  const output = path.join(dir, "out");
  await assert.rejects(() => exportSlides(dir, { preset: "instagram", outputDir: output }), /maximum is 250/);
  await assert.rejects(fs.access(output));
}));

test("flipbook check passes the blueprint example and prints the match", () => {
  const result = spawnSync(process.execPath, [bin, "check", "examples/blueprint-talk"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /5 slide\(s\) match the blueprint/);
});
