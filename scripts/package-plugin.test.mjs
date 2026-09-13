import assert from "node:assert/strict";
import { linkSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { unzipSync } from "fflate";
import { packagePlugin, validateMarketplaceManifest } from "./lib/marketplace.mjs";

function fixture(t) {
  const temporaryRoot = realpathSync(tmpdir());
  const root = mkdtempSync(join(temporaryRoot, "atlas-marketplace-"));
  t.after(() => {
    const target = resolve(root);
    assert.equal(dirname(target), temporaryRoot);
    assert.ok(target.startsWith(join(temporaryRoot, "atlas-marketplace-")));
    rmSync(target, { recursive: true, force: true });
  });
  const distribution = join(root, "dist");
  const manifest = { name: "example", author: "Owner", url: "https://github.com/Owner/example", version: "0.1.0",
    minAppVersion: "3.8.3", displayName: { default: "Example" }, description: { default: "Example graph" },
    readme: { default: "README.md", "zh-CN": "README_zh_CN.md" } };
  const write = (name, text) => {
    const path = join(distribution, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };
  for (const [name, text] of Object.entries({ "plugin.json": JSON.stringify(manifest), "index.js": "module.exports = Plugin",
    "index.css": "body{}", "README.md": "Docs", "README_zh_CN.md": "Localized docs",
    "third-party-mentions.txt": "Parser notices", "third-party-communities.txt": "Rust notices",
    "ui/index.html": '<script src="assets/app.js"></script>', "ui/assets/app.js": "console.log('ready')" })) write(name, text);
  write("ui/assets/graph.wasm", Uint8Array.of(0, 97, 115, 109, 255));
  return { root, write, manifest, args: { distribution, expectedManifest: manifest,
    expectedPackage: { name: "example", version: "0.1.0" }, license: "Project license", notice: "Source notices",
    runtimeNotices: "Library notices", tag: "v0.1.0" } };
}

test("the release archive preserves runtime assets, notices, root paths and contents", t => {
  const f = fixture(t);
  const result = packagePlugin(f.args);
  const files = unzipSync(readFileSync(result.path));
  assert.equal(result.files, 13);
  assert.equal(result.version, "0.1.0");
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.ok(Object.keys(files).every(name => !name.includes("\\") && !name.startsWith("dist/")));
  assert.deepEqual(files["ui/assets/graph.wasm"], Uint8Array.of(0, 97, 115, 109, 255));
  assert.deepEqual(JSON.parse(Buffer.from(files["plugin.json"]).toString()), f.manifest);
  assert.equal(Buffer.from(files.LICENSE).toString(), "Project license");
  assert.equal(Buffer.from(files["third-party-runtime.txt"]).toString(), "Library notices");
});

test("repeated packaging is deterministic and never includes the previous archive", t => {
  const f = fixture(t);
  const first = packagePlugin(f.args);
  const second = packagePlugin(f.args);
  assert.equal(first.sha256, second.sha256);
  assert.equal(unzipSync(readFileSync(second.path))["package.zip"], undefined);
});

test("stale build metadata and mismatched release tags fail before replacing an archive", t => {
  const f = fixture(t);
  const first = packagePlugin(f.args);
  const before = readFileSync(first.path);
  assert.throws(() => packagePlugin({ ...f.args, tag: "v0.2.0" }), /tag must match/);
  f.write("plugin.json", JSON.stringify({ ...f.manifest, version: "0.2.0" }));
  assert.throws(() => packagePlugin(f.args), /current plugin manifest/);
  assert.deepEqual(readFileSync(first.path), before);
});

test("unrelated files and linked inputs cannot enter the release archive", t => {
  const f = fixture(t);
  f.write("credentials.txt", "not a build asset");
  assert.throws(() => packagePlugin(f.args), /Unexpected build file/);
  rmSync(join(f.args.distribution, "credentials.txt"));
  mkdirSync(join(f.root, "external"));
  symlinkSync(join(f.root, "external"), join(f.args.distribution, "ui", "linked"), "junction");
  assert.throws(() => packagePlugin(f.args), /must not contain links/);
});

test("linked archive output cannot overwrite its target", t => {
  const f = fixture(t);
  const outside = join(f.root, "unrelated.zip");
  writeFileSync(outside, "keep");
  linkSync(outside, join(f.args.distribution, "package.zip"));
  assert.throws(() => packagePlugin(f.args), /output must be an ordinary file/);
  assert.equal(readFileSync(outside, "utf8"), "keep");
});

test("incomplete runtime assets and unsafe readme paths are rejected", t => {
  const f = fixture(t);
  rmSync(join(f.args.distribution, "ui", "index.html"));
  assert.throws(() => packagePlugin(f.args), /Missing package asset: ui\/index.html/);
  assert.throws(() => validateMarketplaceManifest({ ...f.manifest, readme: { default: "../private.md" } }, f.args.expectedPackage), /Unsafe archive path/);
});

test("marketplace metadata rejects empty authors, invalid URLs and legacy locale keys", t => {
  const f = fixture(t);
  assert.throws(() => validateMarketplaceManifest({ ...f.manifest, author: "" }, f.args.expectedPackage), /author is required/);
  assert.throws(() => validateMarketplaceManifest({ ...f.manifest, url: "" }, f.args.expectedPackage), /repository URL/);
  assert.throws(() => validateMarketplaceManifest({ ...f.manifest, readme: { default: "README.md", zh_CN: "README_zh_CN.md" } }, f.args.expectedPackage));
});
