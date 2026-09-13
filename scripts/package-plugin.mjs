import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { collectRuntimeNotices } from "./lib/license-notices.mjs";
import { packagePlugin } from "./lib/marketplace.mjs";

const { values } = parseArgs({ options: { tag: { type: "string" } } });
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const plugin = resolve(repository, "apps/siyuan-plugin");
const json = path => JSON.parse(readFileSync(path, "utf8"));
const result = packagePlugin({
  distribution: resolve(plugin, "dist"),
  expectedManifest: json(resolve(plugin, "public/plugin.json")),
  expectedPackage: json(resolve(plugin, "package.json")),
  license: readFileSync(resolve(repository, "LICENSE"), "utf8"),
  notice: readFileSync(resolve(repository, "NOTICE.md"), "utf8"),
  runtimeNotices: collectRuntimeNotices(plugin),
  tag: values.tag,
});
console.log(JSON.stringify(result, null, 2));
