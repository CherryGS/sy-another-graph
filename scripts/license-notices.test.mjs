import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { renderRuntimeNotices } from "./lib/license-notices.mjs";

test("license notices preserve attribution and text while excluding local installation paths", (t) => {
  const temporaryRoot = realpathSync(tmpdir());
  const root = mkdtempSync(join(temporaryRoot, "atlas-license-"));
  t.after(() => {
    assert.equal(dirname(resolve(root)), temporaryRoot);
    assert.ok(root.startsWith(join(temporaryRoot, "atlas-license-")));
    rmSync(root, { recursive: true, force: true });
  });
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "example",
      version: "1.2.3",
      author: { name: "Author" },
      repository: { url: "https://github.com/owner/example" },
    }),
  );
  writeFileSync(join(root, "LICENSE"), "Copyright Author\nPermission text");
  writeFileSync(join(root, "NOTICE.txt"), "Additional notice");
  const row = { name: "example", paths: [root], license: "MIT" };
  const result = renderRuntimeNotices({ MIT: [row, row] });
  assert.ok(result.includes(readFileSync(join(root, "LICENSE"), "utf8")));
  assert.ok(result.includes("Additional notice"));
  assert.ok(result.includes("Author: Author"));
  assert.ok(result.includes("Source: https://github.com/owner/example"));
  assert.equal(result.split("example@1.2.3").length - 1, 1);
  assert.ok(!result.includes(root));
  assert.throws(() => renderRuntimeNotices({}), /report is empty/);
});
