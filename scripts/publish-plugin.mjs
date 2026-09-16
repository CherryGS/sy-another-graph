import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runPublishCli } from "./lib/publishing.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
runPublishCli(repository, process.argv.slice(2)).catch((error) => {
  console.error(`发布未完成：${error.message}`);
  process.exitCode = 1;
});
