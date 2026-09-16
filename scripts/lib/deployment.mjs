import assert from "node:assert/strict";
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep, win32 } from "node:path";

const markerName = ".atlas-deployment.json";

function statIfPresent(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

function ordinaryDirectory(path, required = false) {
  const stat = statIfPresent(path);
  assert.ok(!required || stat, `Required directory is missing: ${path}`);
  assert.ok(
    !stat || (!stat.isSymbolicLink() && stat.isDirectory()),
    `Deployment requires an ordinary directory, not a link: ${path}`,
  );
}

function ordinaryFile(path) {
  const stat = statIfPresent(path);
  assert.ok(
    !stat || (!stat.isSymbolicLink() && stat.isFile() && stat.nlink === 1),
    `Deployment requires an ordinary file without links: ${path}`,
  );
  return stat;
}

function safeFile(file) {
  assert.ok(
    typeof file === "string" &&
      file.length > 0 &&
      !isAbsolute(file) &&
      !win32.isAbsolute(file) &&
      !file.includes("\0"),
    "Invalid deployment file path",
  );
  const parts = file.split(/[\\/]/);
  assert.ok(
    parts.every(
      (part) => part && part !== "." && part !== ".." && !part.includes(":") && !/[. ]$/.test(part),
    ),
    "Deployment file paths must be safe relative paths",
  );
  const normalized = parts.join(sep);
  assert.notEqual(parts[0].toLowerCase(), markerName, "The deployment marker is reserved");
  return normalized;
}

function fileKey(file) {
  return process.platform === "win32" ? file.toLowerCase() : file;
}

function uniqueFiles(files) {
  assert.ok(Array.isArray(files), "Managed deployment files must be an array");
  const normalized = files.map(safeFile);
  assert.equal(
    new Set(normalized.map(fileKey)).size,
    normalized.length,
    "Managed deployment files must be unique",
  );
  return normalized;
}

function filesBelow(distribution, directory = distribution) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    // Marketplace archives are delivery artifacts, not plugin runtime assets.
    if (directory === distribution && entry.name === "package.zip") return [];
    const path = join(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), `Build output must not contain links: ${path}`);
    if (entry.isDirectory()) return filesBelow(distribution, path);
    assert.ok(entry.isFile(), `Build output must contain ordinary files: ${path}`);
    return [relative(distribution, path)];
  });
}

function destination(target, file) {
  const path = resolve(target, file);
  assert.ok(
    path.startsWith(target + sep),
    "Deployment files must remain inside the plugin directory",
  );
  let parent = target;
  for (const part of file.split(sep).slice(0, -1)) {
    parent = join(parent, part);
    ordinaryDirectory(parent);
  }
  return { path, stat: ordinaryFile(path) };
}

export function deployPlugin({ workspace, distribution }) {
  workspace = realpathSync(resolve(workspace));
  distribution = realpathSync(resolve(distribution));
  ordinaryDirectory(workspace, true);
  ordinaryDirectory(join(workspace, "data"), true);
  ordinaryDirectory(join(workspace, "conf"), true);
  ordinaryDirectory(distribution, true);

  const files = uniqueFiles(filesBelow(distribution));
  assert.ok(files.includes(join("ui", "index.html")), "Build the complete plugin before deploying");
  const manifest = JSON.parse(readFileSync(join(distribution, "plugin.json"), "utf8"));
  assert.match(
    manifest.name,
    /^[a-z0-9-]+$/,
    "The plugin name must be a single safe directory name",
  );
  const plugins = join(workspace, "data", "plugins");
  ordinaryDirectory(plugins);
  const target = join(plugins, manifest.name);
  const targetStat = statIfPresent(target);
  const migrateLink = targetStat?.isSymbolicLink() ?? false;
  if (migrateLink) {
    assert.equal(
      realpathSync(target),
      distribution,
      "A different link occupies the target; it will not be replaced",
    );
  } else {
    ordinaryDirectory(target);
  }

  const markerPath = join(target, markerName);
  let previousFiles = [];
  if (targetStat && !migrateLink) {
    assert.ok(
      ordinaryFile(markerPath),
      "An unmanaged plugin occupies the target; it will not be overwritten",
    );
    const previous = JSON.parse(readFileSync(markerPath, "utf8"));
    assert.equal(previous?.source, distribution, "This target belongs to a different build");
    previousFiles = uniqueFiles(previous.files);
  }

  const previousKeys = new Set(previousFiles.map(fileKey));
  const nextKeys = new Set(files.map(fileKey));
  if (!migrateLink) {
    for (const file of previousFiles) destination(target, file);
    for (const file of files) {
      const output = destination(target, file);
      assert.ok(
        !output.stat || previousKeys.has(fileKey(file)),
        `An unmanaged file occupies a build path; it will not be overwritten: ${output.path}`,
      );
    }
  }

  // All paths and ownership data have passed preflight. Remove only our exact
  // distribution link, never the directory it points at or unrelated files.
  if (migrateLink) unlinkSync(target);
  mkdirSync(target, { recursive: true });
  for (const file of files) {
    const output = join(target, file);
    mkdirSync(dirname(output), { recursive: true });
    copyFileSync(join(distribution, file), output);
  }
  for (const file of previousFiles) {
    if (!nextKeys.has(fileKey(file))) {
      const path = join(target, file);
      if (statIfPresent(path)) unlinkSync(path);
    }
  }
  writeFileSync(markerPath, JSON.stringify({ source: distribution, files }, null, 2) + "\n");
  return target;
}
