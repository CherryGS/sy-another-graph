import assert from "node:assert/strict";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceArgument = process.argv[2];
assert.ok(
  workspaceArgument,
  "Pass the explicitly authorized SiYuan test workspace path",
);
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = realpathSync(resolve(workspaceArgument));
assert.ok(
  existsSync(join(workspace, "data")) && existsSync(join(workspace, "conf")),
  "The path must be an existing SiYuan workspace",
);
const distribution = realpathSync(join(repository, "apps/siyuan-plugin/dist"));
assert.ok(
  existsSync(join(distribution, "ui/index.html")),
  "Build the complete plugin before deploying",
);
const manifest = JSON.parse(
  readFileSync(join(distribution, "plugin.json"), "utf8"),
);
assert.match(
  manifest.name,
  /^[a-z0-9-]+$/,
  "The plugin name must be a single safe directory name",
);
const plugins = join(workspace, "data/plugins");
mkdirSync(plugins, { recursive: true });
const target = join(plugins, manifest.name);
assert.equal(
  dirname(target),
  plugins,
  "The target must remain inside the selected plugins directory",
);
if (existsSync(target) && lstatSync(target).isSymbolicLink()) {
  assert.equal(
    realpathSync(target),
    distribution,
    "A different link occupies the target; it will not be replaced",
  );
  // Remove only our link itself, never the directory it points at.
  unlinkSync(target);
}
const markerPath = join(target, ".atlas-deployment.json");
let previousFiles = [];
if (existsSync(target)) {
  assert.ok(
    existsSync(markerPath),
    "An unmanaged plugin occupies the target; it will not be overwritten",
  );
  const previous = JSON.parse(readFileSync(markerPath, "utf8"));
  assert.equal(
    previous.source,
    distribution,
    "This target belongs to a different build",
  );
  previousFiles = previous.files;
}
mkdirSync(target, { recursive: true });
function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    assert.ok(
      !entry.isSymbolicLink(),
      "Build output must contain ordinary files",
    );
    return entry.isDirectory()
      ? filesBelow(path)
      : [relative(distribution, path)];
  });
}
function destination(file) {
  assert.ok(
    typeof file === "string" && !isAbsolute(file),
    "Invalid deployment file",
  );
  const path = resolve(target, file);
  assert.ok(
    path.startsWith(target + sep),
    "Deployment files must remain inside the plugin directory",
  );
  return path;
}
const files = filesBelow(distribution);
for (const file of files) {
  const output = destination(file);
  mkdirSync(dirname(output), { recursive: true });
  copyFileSync(join(distribution, file), output);
}
for (const file of previousFiles) {
  if (!files.includes(file)) {
    const path = destination(file);
    if (existsSync(path) && lstatSync(path).isFile()) unlinkSync(path);
  }
}
writeFileSync(
  markerPath,
  JSON.stringify({ source: distribution, files }, null, 2) + "\n",
);
console.log(`Test plugin deployed: ${target}`);
console.log(
  "Reload SiYuan and enable Atlas Graph in the downloaded plugins list.",
);
