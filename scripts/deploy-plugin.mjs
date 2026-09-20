import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { deployPlugin } from "./lib/deployment.mjs";

const workspace = process.argv[2];
assert.ok(workspace, "Pass the explicitly selected SiYuan workspace path");
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distribution = resolve(repository, "apps/siyuan-plugin/dist");
const target = deployPlugin({
  workspace,
  distribution,
});
const manifest = JSON.parse(readFileSync(resolve(distribution, "plugin.json"), "utf8"));
console.log(`Plugin deployed: ${target}`);
console.log(
  `Reload SiYuan and enable ${manifest.displayName.default} in the downloaded plugins list.`,
);
