import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deployPlugin } from "./lib/deployment.mjs";

const workspace = process.argv[2];
assert.ok(workspace, "Pass the explicitly selected SiYuan workspace path");
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = deployPlugin({
  workspace,
  distribution: resolve(repository, "apps/siyuan-plugin/dist"),
});
console.log(`Plugin deployed: ${target}`);
console.log(
  "Reload SiYuan and enable 一个思源图谱 in the downloaded plugins list.",
);
