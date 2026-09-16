import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, relative, dirname, sep } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const portable = (value) => value.split(sep).join("/");

export function boundaryViolation(from, target) {
  const layer = from.split("/")[0];
  const destination = target.split("/")[0];
  if (layer === "core" && destination !== "core")
    return "core cannot depend on product modules, presentation, or platform code";
  if (layer === "shared" && destination !== "shared")
    return "shared code cannot depend on application or product code";
  if (
    layer === "application" &&
    !["core", "application", "modules", "shared"].includes(destination)
  )
    return "application code must receive concrete adapters through its own contracts";
  if (layer === "application" && /(?:^|\/)ui(?:\/|\.)|(?:^|\/)use-[^/]+$/.test(target))
    return "application code cannot depend on feature UI or React bindings";
  if (layer === "application" && target.startsWith("shared/i18n/"))
    return "application results must remain independent of localization";
  if (layer === "modules" && !["core", "modules", "shared"].includes(destination))
    return "capabilities cannot import workbench state or concrete application adapters";
  if (
    layer === "adapters" &&
    (destination === "bootstrap" ||
      (destination === "workbench" && !target.startsWith("workbench/presentation/")))
  )
    return "adapters may use presentation contracts, not workbench state or panels";
  if (layer !== "bootstrap" && destination === "bootstrap")
    return "bootstrap is a composition root, never a dependency";
  return null;
}

export function checkBoundaries(root) {
  const files = readdirSync(root, { recursive: true })
    .map(portable)
    .filter((file) => /\.(?:ts|tsx|mjs)$/.test(file) && !/\.test\./.test(file));
  const failures = [];
  const imports = new Map();
  for (const file of files) {
    const absolute = resolve(root, file);
    const source = readFileSync(absolute, "utf8");
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const dependencies = [];
    const inspect = (specifier, position, typeOnly = false) => {
      const bare = specifier.split("?")[0];
      if (!bare.startsWith(".") && !bare.startsWith("@/")) {
        if (file.startsWith("core/") || file.startsWith("application/"))
          failures.push(
            `${file}: ${specifier}: core/application must not import framework or platform packages`,
          );
        if (!typeOnly) dependencies.push(`package:${specifier}`);
        return;
      }
      const base = bare.startsWith("@/")
        ? resolve(root, bare.slice(2))
        : resolve(dirname(absolute), bare);
      const target = [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, `${base}/index.ts`].find(
        existsSync,
      );
      if (!target) {
        failures.push(`${file}: unresolved source dependency ${specifier}`);
        return;
      }
      const destination = portable(relative(root, target));
      if (destination.startsWith("../")) {
        const wasmConsumer =
          file.endsWith(".worker.ts") ||
          (file.startsWith("adapters/wasm/") && file.endsWith("benchmark.mjs"));
        if (!destination.startsWith("../wasm/") || !wasmConsumer)
          failures.push(
            `${file}: only Worker entrypoints and WASM benchmarks may import generated bindings`,
          );
        return;
      }
      const violation = boundaryViolation(file, destination);
      if (violation) {
        const line = ast.getLineAndCharacterOfPosition(position).line + 1;
        failures.push(`${file}:${line} -> ${destination}: ${violation}`);
      }
      if (!typeOnly) dependencies.push(destination);
    };
    const visit = (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const typeOnly = ts.isExportDeclaration(node)
          ? node.isTypeOnly
          : node.importClause?.isTypeOnly;
        inspect(node.moduleSpecifier.text, node.getStart(ast), typeOnly);
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        inspect(node.arguments[0].text, node.getStart(ast));
      } else if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "URL" &&
        node.arguments?.length === 2 &&
        ts.isStringLiteral(node.arguments[0]) &&
        node.arguments[1].getText(ast) === "import.meta.url"
      ) {
        inspect(node.arguments[0].text, node.getStart(ast));
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
    imports.set(file, dependencies);
  }
  for (const worker of files.filter((file) => file.endsWith(".worker.ts"))) {
    const visited = new Set();
    const pending = [worker];
    while (pending.length) {
      const file = pending.pop();
      if (visited.has(file)) continue;
      visited.add(file);
      if (
        file.endsWith(".tsx") ||
        file.startsWith("workbench/") ||
        file.startsWith("shared/ui/") ||
        file.startsWith("shared/i18n/")
      )
        failures.push(`${worker}: Worker runtime reaches browser UI through ${file}`);
      if (/^package:(?:react(?:-dom|-i18next)?(?:\/|$)|radix-ui$|siyuan$|@cosmograph\/)/.test(file))
        failures.push(`${worker}: Worker runtime reaches a browser UI package through ${file}`);
      pending.push(...(imports.get(file) ?? []));
    }
  }
  return failures;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const failures = checkBoundaries(resolve(import.meta.dirname, "../src"));
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  } else console.log("Module dependencies and Worker environment boundaries are valid.");
}
