import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { en } from "./messages/en";
import { zhCN } from "./messages/zh-CN";

function shape(value: unknown): unknown {
  if (typeof value === "string" || typeof value === "function")
    return typeof value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      shape(child),
    ]),
  );
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

describe("catalog contracts", () => {
  it("keeps both catalogs structurally identical", () => {
    expect(shape(en)).toEqual(shape(zhCN));
  });

  it("keeps Chinese literals in Chinese catalogs, including accessible labels", () => {
    const root = resolve(import.meta.dirname, "..");
    const violations: string[] = [];
    for (const path of sourceFiles(root)) {
      const file = relative(root, path);
      if (/^i18n\/messages\/(?:.*-)?zh-CN\.ts$/.test(file)) continue;
      const source = ts.createSourceFile(
        path,
        readFileSync(path, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      function visit(node: ts.Node): void {
        if (
          (ts.isStringLiteralLike(node) ||
            ts.isJsxText(node) ||
            ts.isTemplateHead(node) ||
            ts.isTemplateMiddle(node) ||
            ts.isTemplateTail(node)) &&
          /\p{Script=Han}/u.test(node.text)
        ) {
          // Language names must remain recognizable while viewing another language.
          const nativeLanguageName =
            file === "i18n/messages/en.ts" &&
            node.text === "简体中文" &&
            ts.isPropertyAssignment(node.parent) &&
            node.parent.name.getText(source) === "chinese";
          if (!nativeLanguageName) {
            const { line } = source.getLineAndCharacterOfPosition(
              node.getStart(source),
            );
            violations.push(`${file}:${line + 1}: ${node.text}`);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect(violations).toEqual([]);
  });
});
