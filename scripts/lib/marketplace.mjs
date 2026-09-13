import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { zipSync, unzipSync } from "fflate";

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const requiredFiles = ["index.js", "index.css", "plugin.json", "README.md", "ui/index.html",
  "third-party-mentions.txt", "third-party-communities.txt"];

function safePath(path) {
  assert.ok(typeof path === "string" && path.length > 0, "Archive paths must be nonempty strings");
  assert.ok(path.split("/").every(part => part && part !== "." && part !== ".." &&
    part.trim() === part && !part.startsWith(".") && !part.endsWith(".") && !/[\\:*?"<>|\0]/.test(part)),
  `Unsafe archive path: ${path}`);
  return path;
}

export function validateMarketplaceManifest(manifest, expectedPackage, tag) {
  assert.match(manifest.name, /^[a-z0-9-]+$/, "A safe plugin package name is required");
  assert.equal(manifest.name, expectedPackage.name, "Plugin and package names must agree");
  assert.equal(manifest.version, expectedPackage.version, "Plugin and package versions must agree");
  assert.match(manifest.version, stableVersion, "Publish a stable semver version");
  if (tag !== undefined) assert.equal(tag, `v${manifest.version}`, "Release tag must match the plugin version");
  assert.ok(typeof manifest.author === "string" && manifest.author.trim(), "An author is required for the marketplace");
  assert.match(manifest.url, /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "A GitHub repository URL is required");
  assert.equal(new URL(manifest.url).pathname.split("/").at(-1), manifest.name, "Repository and plugin names must agree");
  assert.match(manifest.minAppVersion, stableVersion, "A minimum SiYuan version is required");
  for (const field of ["displayName", "description", "readme"]) {
    const locales = manifest[field];
    assert.ok(locales && typeof locales === "object" && !Array.isArray(locales), `${field} must be a locale map`);
    assert.ok(typeof locales.default === "string" && locales.default.trim(), `${field}.default is required`);
    for (const [locale, value] of Object.entries(locales)) {
      if (locale !== "default") assert.equal(Intl.getCanonicalLocales(locale)[0], locale, `Use a canonical language tag: ${locale}`);
      assert.ok(typeof value === "string" && value.trim(), `${field}.${locale} must be nonempty text`);
      if (field === "readme") safePath(value);
    }
  }
  return manifest;
}

/** Package only the built runtime, using forward-slash paths on every platform. */
export function packagePlugin({ distribution, expectedManifest, expectedPackage, license, notice, runtimeNotices, tag }) {
  distribution = resolve(distribution);
  const root = lstatSync(distribution);
  assert.ok(root.isDirectory() && !root.isSymbolicLink(), "Distribution must be an ordinary directory");
  const manifest = JSON.parse(readFileSync(join(distribution, "plugin.json"), "utf8"));
  assert.deepEqual(manifest, expectedManifest, "Build output must match the current plugin manifest");
  validateMarketplaceManifest(manifest, expectedPackage, tag);
  for (const [name, content] of Object.entries({ license, notice, runtimeNotices }))
    assert.ok(typeof content === "string" && content.trim(), `Missing ${name}`);
  const allowedRoots = new Set([...requiredFiles.filter(file => !file.includes("/")),
    ...Object.values(manifest.readme).map(file => file.split("/")[0]), "ui",
    ...[manifest.icon, manifest.preview].filter(Boolean)]);
  const files = new Map();
  function collect(directory, prefix = "") {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      if (!prefix && entry.name === "package.zip") continue;
      const path = safePath(prefix + entry.name);
      if (!prefix) assert.ok(allowedRoots.has(entry.name), `Unexpected build file: ${path}`);
      assert.ok(!entry.isSymbolicLink(), `Archive input must not contain links: ${path}`);
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) collect(absolute, `${path}/`);
      else {
        const stat = lstatSync(absolute);
        assert.ok(stat.isFile() && stat.nlink === 1, `Archive input must be an ordinary file: ${path}`);
        files.set(path, readFileSync(absolute));
      }
    }
  }
  collect(distribution);
  for (const name of [...requiredFiles, ...Object.values(manifest.readme), ...[manifest.icon, manifest.preview].filter(Boolean)])
    assert.ok(files.get(name)?.length, `Missing package asset: ${name}`);
  files.set("LICENSE", Buffer.from(license));
  files.set("NOTICE.md", Buffer.from(notice));
  files.set("third-party-runtime.txt", Buffer.from(runtimeNotices));
  const entries = Object.create(null);
  for (const name of [...files.keys()].sort()) entries[name] = files.get(name);
  const archive = zipSync(entries, { level: 6, mtime: new Date(1980, 0, 1) });
  const extracted = unzipSync(archive);
  assert.deepEqual(Object.keys(extracted).sort(), Object.keys(entries).sort(), "Archive entry mismatch");
  for (const [name, bytes] of files)
    assert.ok(Buffer.from(extracted[name]).equals(bytes), `Archive content mismatch: ${name}`);
  const path = join(distribution, "package.zip");
  try {
    const stat = lstatSync(path);
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, "Archive output must be an ordinary file");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  writeFileSync(path, archive);
  return { path, version: manifest.version, files: files.size, bytes: archive.length,
    sha256: createHash("sha256").update(archive).digest("hex") };
}
