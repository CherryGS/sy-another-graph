import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { verifyMentionWorker } from "./check-mentions-worker.mjs";

const readJson = (path) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const manifest = readJson("../public/plugin.json");
const packageJson = readJson("../package.json");
const builtManifest = readJson("../dist/plugin.json");

assert.equal(
  manifest.name,
  packageJson.name,
  "Plugin and package names must agree",
);
assert.equal(
  manifest.version,
  packageJson.version,
  "Plugin and package versions must agree",
);
assert.deepEqual(
  builtManifest,
  manifest,
  "The build must copy the current plugin manifest",
);
assert.ok(manifest.displayName.default, "A default display name is required");
assert.ok(manifest.description.default, "A default description is required");

for (const file of [
  "index.js",
  "index.css",
  "third-party-mentions.txt",
  manifest.readme.default,
  "ui/index.html",
]) {
  assert.ok(
    existsSync(new URL(`../dist/${file}`, import.meta.url)),
    `Missing build asset: ${file}`,
  );
}

// Check the generated loader contract without attaching to a live SiYuan workspace.
class HostPlugin {}
const pluginModule = { exports: {} };
const bundle = readFileSync(
  new URL("../dist/index.js", import.meta.url),
  "utf8",
);

runInNewContext(
  bundle,
  {
    module: pluginModule,
    exports: pluginModule.exports,
    require(id) {
      assert.equal(
        id,
        "siyuan",
        "The host adapter should only require the SiYuan API",
      );
      return { Plugin: HostPlugin };
    },
  },
  { filename: "dist/index.js", timeout: 1_000 },
);

assert.equal(
  typeof pluginModule.exports,
  "function",
  "SiYuan expects a CommonJS plugin constructor",
);
assert.ok(
  pluginModule.exports.prototype instanceof HostPlugin,
  "The entry must extend the host Plugin",
);

await verifyMentionWorker();
console.log("Plugin metadata, build assets, CommonJS entry, and bundled mention worker are valid.");
