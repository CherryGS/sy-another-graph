import assert from "node:assert/strict";
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { deployPlugin } from "./lib/deployment.mjs";

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function fixture(t) {
  const temporaryRoot = realpathSync(tmpdir());
  const root = mkdtempSync(join(temporaryRoot, "atlas-deployment-"));
  t.after(() => {
    const cleanupTarget = resolve(root);
    assert.ok(cleanupTarget.startsWith(join(temporaryRoot, "atlas-deployment-")));
    assert.equal(dirname(cleanupTarget), temporaryRoot);
    rmSync(cleanupTarget, { recursive: true, force: true });
  });
  const workspace = join(root, "workspace");
  const distribution = join(root, "dist");
  mkdirSync(join(workspace, "data"), { recursive: true });
  mkdirSync(join(workspace, "conf"));
  write(join(distribution, "plugin.json"), JSON.stringify({ name: "sy-another-graph" }));
  write(join(distribution, "index.js"), "original host");
  write(join(distribution, "ui", "index.html"), "original UI");
  write(join(distribution, "ui", "assets", "old.js"), "old asset");
  const target = join(workspace, "data", "plugins", "sy-another-graph");
  return { root, workspace, distribution, target, marker: join(target, ".atlas-deployment.json") };
}

function snapshot(root) {
  const entries = [];
  function visit(path, relativePath = "") {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      entries.push([relativePath, "link", readlinkSync(path)]);
    } else if (stat.isDirectory()) {
      entries.push([relativePath, "directory"]);
      for (const name of readdirSync(path).sort())
        visit(join(path, name), join(relativePath, name));
    } else {
      entries.push([relativePath, "file", readFileSync(path, "utf8")]);
    }
  }
  visit(root);
  return entries;
}

function rejectedWithoutChanges(f, pattern) {
  const before = snapshot(f.workspace);
  assert.throws(() => deployPlugin(f), pattern);
  assert.deepEqual(snapshot(f.workspace), before);
}

function renameInsideFixture(f, source, destination) {
  const resolvedSource = resolve(source);
  const resolvedDestination = resolve(destination);
  assert.ok(resolvedSource.startsWith(f.root + sep));
  assert.ok(resolvedDestination.startsWith(f.root + sep));
  renameSync(resolvedSource, resolvedDestination);
}

test("first and repeated deployment updates managed files, removes stale assets, and preserves other files", (t) => {
  const f = fixture(t);
  assert.equal(deployPlugin(f), f.target);
  assert.equal(readFileSync(join(f.target, "index.js"), "utf8"), "original host");
  write(join(f.target, "user-settings.json"), "personal settings");
  write(join(f.distribution, "index.js"), "updated host");
  write(join(f.distribution, "ui", "assets", "new.js"), "new asset");
  unlinkSync(join(f.distribution, "ui", "assets", "old.js"));

  deployPlugin(f);

  assert.equal(readFileSync(join(f.target, "index.js"), "utf8"), "updated host");
  assert.equal(readFileSync(join(f.target, "ui", "assets", "new.js"), "utf8"), "new asset");
  assert.ok(!existsSync(join(f.target, "ui", "assets", "old.js")));
  assert.equal(readFileSync(join(f.target, "user-settings.json"), "utf8"), "personal settings");
  const marker = JSON.parse(readFileSync(f.marker, "utf8"));
  assert.equal(marker.source, realpathSync(f.distribution));
  assert.ok(marker.files.includes(join("ui", "assets", "new.js")));
  assert.ok(!marker.files.includes(join("ui", "assets", "old.js")));
});

test("an unrelated plugin directory is preserved", (t) => {
  const f = fixture(t);
  write(join(f.target, "index.js"), "unrelated plugin");
  rejectedWithoutChanges(f, /unmanaged plugin/);
});

test("marketplace archives stay outside the installed plugin", (t) => {
  const f = fixture(t);
  write(join(f.distribution, "package.zip"), "marketplace archive");
  deployPlugin(f);
  assert.ok(!existsSync(join(f.target, "package.zip")));
  assert.ok(!JSON.parse(readFileSync(f.marker, "utf8")).files.includes("package.zip"));
  write(join(f.target, "package.zip"), "user file");
  deployPlugin(f);
  assert.equal(readFileSync(join(f.target, "package.zip"), "utf8"), "user file");
});

test("a new build path cannot overwrite an unmanaged file or partially update earlier files", (t) => {
  const f = fixture(t);
  deployPlugin(f);
  write(join(f.target, "ui", "assets", "new.js"), "personal file");
  write(join(f.distribution, "index.js"), "must not be copied");
  write(join(f.distribution, "ui", "assets", "new.js"), "build collision");
  rejectedWithoutChanges(f, /unmanaged file/);
});

for (const [name, files] of [
  ["path traversal", ["../outside.txt"]],
  ["absolute path", ["C:\\outside.txt"]],
  ["non-array files", "index.js"],
  ["duplicate files", ["index.js", "index.js"]],
  ["reserved marker", [".atlas-deployment.json"]],
  ["reserved marker directory", [".atlas-deployment.json/asset.js"]],
]) {
  test(`marker ${name} is rejected before any build file changes`, (t) => {
    const f = fixture(t);
    deployPlugin(f);
    write(f.marker, JSON.stringify({ source: realpathSync(f.distribution), files }));
    write(join(f.distribution, "index.js"), "must not be copied");
    rejectedWithoutChanges(f, /deployment|relative|unique|reserved/i);
  });
}

test("malformed JSON and a different marker source are rejected before writes", (t) => {
  const f = fixture(t);
  deployPlugin(f);
  write(join(f.distribution, "index.js"), "must not be copied");
  write(f.marker, "{");
  rejectedWithoutChanges(f, /JSON/);
  write(f.marker, JSON.stringify({ source: f.root, files: ["index.js"] }));
  rejectedWithoutChanges(f, /different build/);
});

test("a workspace must have ordinary data and conf directories", (t) => {
  const f = fixture(t);
  renameInsideFixture(f, join(f.workspace, "conf"), join(f.root, "saved-conf"));
  write(join(f.workspace, "conf"), "not a directory");
  rejectedWithoutChanges(f, /ordinary directory/);
});

test("a plugins directory junction cannot redirect deployment outside the workspace", (t) => {
  const f = fixture(t);
  const outside = join(f.root, "outside");
  mkdirSync(outside);
  write(join(outside, "sentinel.txt"), "unchanged");
  symlinkSync(outside, join(f.workspace, "data", "plugins"), "junction");
  const before = snapshot(outside);
  rejectedWithoutChanges(f, /ordinary directory/);
  assert.deepEqual(snapshot(outside), before);
});

test("a junction under an existing managed plugin is rejected before copying or stale cleanup", (t) => {
  const f = fixture(t);
  deployPlugin(f);
  const outside = join(f.root, "outside-ui");
  renameInsideFixture(f, join(f.target, "ui"), outside);
  symlinkSync(outside, join(f.target, "ui"), "junction");
  write(join(f.distribution, "index.js"), "must not be copied");
  unlinkSync(join(f.distribution, "ui", "assets", "old.js"));
  const before = snapshot(outside);
  rejectedWithoutChanges(f, /ordinary directory/);
  assert.deepEqual(snapshot(outside), before);
});

test("an output file linked to another file is rejected before overwriting it", (t) => {
  const f = fixture(t);
  deployPlugin(f);
  const outside = join(f.root, "outside.js");
  write(outside, "external content");
  unlinkSync(join(f.target, "index.js"));
  linkSync(outside, join(f.target, "index.js"));
  write(join(f.distribution, "index.js"), "must not be copied");
  rejectedWithoutChanges(f, /ordinary file without links/);
  assert.equal(readFileSync(outside, "utf8"), "external content");
});

test("source junctions fail before creating a deployment", (t) => {
  const f = fixture(t);
  const outside = join(f.root, "outside");
  mkdirSync(outside);
  symlinkSync(outside, join(f.distribution, "linked-assets"), "junction");
  rejectedWithoutChanges(f, /Build output must not contain links/);
});

test("source files cannot occupy the reserved marker directory", (t) => {
  const f = fixture(t);
  write(join(f.distribution, ".atlas-deployment.json", "asset.js"), "invalid");
  rejectedWithoutChanges(f, /reserved/);
});

test("the exact distribution junction migrates to ordinary files without changing its source", (t) => {
  const f = fixture(t);
  mkdirSync(dirname(f.target), { recursive: true });
  symlinkSync(f.distribution, f.target, "junction");
  const sourceBefore = snapshot(f.distribution);

  deployPlugin(f);

  assert.ok(lstatSync(f.target).isDirectory());
  assert.ok(!lstatSync(f.target).isSymbolicLink());
  assert.equal(readFileSync(join(f.target, "index.js"), "utf8"), "original host");
  assert.deepEqual(snapshot(f.distribution), sourceBefore);
});

test("a foreign target junction is preserved", (t) => {
  const f = fixture(t);
  const outside = join(f.root, "outside");
  mkdirSync(outside);
  mkdirSync(dirname(f.target), { recursive: true });
  symlinkSync(outside, f.target, "junction");
  rejectedWithoutChanges(f, /different link/);
});

test("an invalid source cannot remove the existing distribution junction", (t) => {
  const f = fixture(t);
  mkdirSync(dirname(f.target), { recursive: true });
  symlinkSync(f.distribution, f.target, "junction");
  write(join(f.distribution, ".atlas-deployment.json"), "reserved path");
  rejectedWithoutChanges(f, /reserved/);
  assert.ok(lstatSync(f.target).isSymbolicLink());
});

test("the CLI rejects a missing workspace argument", () => {
  const cli = fileURLToPath(new URL("./deploy-plugin.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [cli], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Pass the explicitly selected SiYuan workspace path/);
});
