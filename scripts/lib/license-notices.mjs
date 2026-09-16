import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Preserve license texts and package attribution, without embedding local paths. */
export function renderRuntimeNotices(report) {
  const packages = new Map();
  for (const rows of Object.values(report)) {
    assert.ok(Array.isArray(rows), "Invalid pnpm license report");
    for (const row of rows) {
      for (const path of row.paths) {
        const metadata = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
        const key = `${metadata.name}@${metadata.version}`;
        if (packages.has(key)) continue;
        const source =
          typeof metadata.repository === "string" ? metadata.repository : metadata.repository?.url;
        const authors =
          typeof metadata.author === "string" ? metadata.author : metadata.author?.name;
        const lines = [
          key,
          "=".repeat(72),
          `Declared license: ${row.license}`,
          ...(authors ? [`Author: ${authors}`] : []),
          ...(source ? [`Source: ${source}`] : []),
        ];
        const names = readdirSync(path, { withFileTypes: true })
          .filter(
            (entry) =>
              entry.isFile() &&
              /^(licen[sc]e|copying|copyright|notice)(?:[._ -].*)?$/i.test(entry.name),
          )
          .map((entry) => entry.name)
          .sort();
        for (const name of names)
          lines.push(
            `\n${name}\n${"-".repeat(72)}\n${readFileSync(join(path, name), "utf8").trim()}`,
          );
        if (!names.length)
          lines.push(
            "No standalone license file was included in this installed package; refer to its declared license and upstream source.",
          );
        packages.set(key, lines.join("\n"));
      }
    }
  }
  assert.ok(packages.size, "The production dependency license report is empty");
  return [
    "Third-party production dependency notices",
    "",
    "Generated from the locked production dependency tree. Some packages are removed by the bundler.",
    "Third-party code retains its original license. See NOTICE.md for local Cosmograph/Cosmos changes.",
    "",
    ...[...packages.entries()].sort(([a], [b]) => a.localeCompare(b, "en")).map(([, text]) => text),
    "",
  ].join("\n\n");
}

export function collectRuntimeNotices(pluginDirectory) {
  const pnpm = process.env.npm_execpath;
  assert.ok(pnpm, "Run the packager through pnpm package or pnpm package:artifacts");
  const output = execFileSync(
    process.execPath,
    [pnpm, "--dir", pluginDirectory, "licenses", "list", "--prod", "--json"],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  return renderRuntimeNotices(JSON.parse(output));
}
