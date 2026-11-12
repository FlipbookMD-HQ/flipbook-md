import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { parse as parseYaml } from "yaml";

const bin = path.resolve("bin/flipbook.js");
const realLibrary = path.join(os.homedir(), "Documents", "flipbook", "templates");
const quoteFields = { column: 1, row: 2, width: 2, height: 1, align: "start" };

async function fixture(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "flipbook-md-"));
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function listing(directory) {
  try {
    return (await fs.readdir(directory)).sort();
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function run(args, cwd, home) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, FLIPBOOK_HOME: home }
  });
}

test("flipbook template add writes the library and merges the deck", async () => fixture(async dir => {
  const home = path.join(dir, "home");
  const deck = path.join(dir, "deck");
  const loose = path.join(dir, "loose");
  await fs.mkdir(deck, { recursive: true });
  await fs.mkdir(loose, { recursive: true });
  await fs.writeFile(path.join(deck, "presentation.yml"), "title: Deck\nslides:\n  - slides/01-open.slide.md\n");
  await fs.mkdir(path.join(deck, "slides"), { recursive: true });
  await fs.writeFile(path.join(deck, "slides/01-open.slide.md"), "# Open\n");
  const existing = "aside:\n  column: 3\n  row: 3\n  width: 1\n  height: 1\n  align: end\n";
  await fs.writeFile(path.join(deck, "templates.yml"), existing);
  const before = await listing(realLibrary);

  const added = run(
    ["template", "add", "quote", "--column", "1", "--row", "2", "--width", "2", "--height", "1", "--align", "start"],
    deck,
    home
  );
  assert.equal(added.status, 0, added.stderr);
  const libraryFile = path.join(home, "templates", "quote.yml");
  const library = parseYaml(await fs.readFile(libraryFile, "utf8"));
  const merged = parseYaml(await fs.readFile(path.join(deck, "templates.yml"), "utf8"));
  assert.deepEqual(library, quoteFields);
  assert.deepEqual(merged.quote, quoteFields);
  assert.deepEqual(merged.aside, { column: 3, row: 3, width: 1, height: 1, align: "end" });
  assert.match(added.stdout, /quote\.yml/);

  const onlyLibrary = run(
    ["template", "add", "banner", "--align", "center", "--width", "1", "--height", "1", "--column", "2", "--row", "1"],
    loose,
    home
  );
  assert.equal(onlyLibrary.status, 0, onlyLibrary.stderr);
  assert.deepEqual(parseYaml(await fs.readFile(path.join(home, "templates", "banner.yml"), "utf8")), {
    column: 2, row: 1, width: 1, height: 1, align: "center"
  });
  await assert.rejects(fs.access(path.join(loose, "templates.yml")));

  const beforeReject = await fs.readFile(path.join(deck, "templates.yml"), "utf8");
  const reserved = run(["template", "add", "cover", "--column", "1", "--row", "1", "--width", "1", "--height", "1", "--align", "center"], deck, home);
  assert.equal(reserved.status, 1);
  assert.match(reserved.stderr, /Flipbook MD:/);
  await assert.rejects(fs.access(path.join(home, "templates", "cover.yml")));
  assert.equal(await fs.readFile(path.join(deck, "templates.yml"), "utf8"), beforeReject);

  const outside = run(["template", "add", "wide", "--column", "3", "--row", "1", "--width", "2", "--height", "1", "--align", "start"], deck, home);
  assert.equal(outside.status, 1);
  await assert.rejects(fs.access(path.join(home, "templates", "wide.yml")));

  const missing = run(["template", "add", "narrow", "--column", "1", "--row", "1", "--width", "1", "--height", "1"], deck, home);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /--align/);
  await assert.rejects(fs.access(path.join(home, "templates", "narrow.yml")));
  assert.deepEqual(parseYaml(await fs.readFile(path.join(deck, "templates.yml"), "utf8")).quote, quoteFields);

  const help = spawnSync(process.execPath, [bin, "--help"], { encoding: "utf8" });
  assert.match(help.stdout, /flipbook template add <name> --column <n> --row <n> --width <n> --height <n> --align start\|center\|end/);
  assert.match(help.stdout, /flipbook template add quote --column 1 --row 2 --width 2 --height 1 --align start/);
  assert.deepEqual(await listing(realLibrary), before);
}));
