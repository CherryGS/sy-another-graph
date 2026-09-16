import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import en from "./en.json";
import zhCN from "./zh-CN.json";

const parameters = (value: string) =>
  [...new Set(Array.from(value.matchAll(/\{\{\s*(\w+)/g), (match) => match[1]))].sort();

describe("translation coverage", () => {
  it("keeps the same keys and interpolation parameters in both catalogs", () => {
    expect(Object.keys(zhCN).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(parameters(en[key]), key).toEqual(parameters(zhCN[key]));
      expect(en[key].replaceAll("一个思源图谱", "")).not.toMatch(/\p{Script=Han}/u);
    }
  });
  it("covers portable message codes and supplies each directly formatted sentence's parameters", () => {
    const root = resolve(import.meta.dirname, "../..");
    for (const file of readdirSync(root, { recursive: true })
      .map(String)
      .filter((file) => /\.tsx?$/.test(file) && !file.includes(".test."))) {
      const source = ts.createSourceFile(
        file,
        readFileSync(resolve(root, file), "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node: ts.Node) => {
        if (
          ts.isStringLiteral(node) &&
          /^(text|common|diagnostics|canvas|community|selection|preset|mentions|search|evidence|relations|report|graph)\./.test(
            node.text,
          )
        ) {
          expect(Object.hasOwn(en, node.text), `${file}: ${node.text}`).toBe(true);
        }
        if (
          ts.isCallExpression(node) &&
          ["t", "msg"].includes(node.expression.getText(source)) &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          const key = node.arguments[0].text as keyof typeof en;
          if (!Object.hasOwn(en, key)) return;
          const options = node.arguments[1];
          const supplied =
            options && ts.isObjectLiteralExpression(options)
              ? options.properties.flatMap((property) =>
                  "name" in property && property.name ? [property.name.getText(source)] : [],
                )
              : [];
          expect(supplied.sort(), `${file}: ${key}`).toEqual(parameters(en[key]));
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  });
});
