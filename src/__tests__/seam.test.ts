import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { SeamViolationError, assertSeam, collectSeamViolations } from "../index.ts";

const made: string[] = [];
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Materialize a throwaway package tree and return its root. */
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "seam-fix-"));
  made.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

test("a clean package has no violations", () => {
  const root = fixture({
    "index.ts": `import { readFileSync } from "node:fs";\nimport { x } from "./util.ts";\nexport const y = readFileSync;\n`,
    "util.ts": `export const x = 1;\n`,
  });
  expect(collectSeamViolations({ root, prod: ["node:fs"] })).toEqual({
    imports: [],
    ambient: [],
  });
});

test("a prod import outside the allowlist is a violation", () => {
  const root = fixture({
    "index.ts": `import { spawn } from "node:child_process";\nexport const z = spawn;\n`,
  });
  const report = collectSeamViolations({ root, prod: ["node:fs"], forbidAmbient: false });
  expect(report.imports).toEqual([{ file: "index.ts", spec: "node:child_process" }]);
});

test("ambient authority in a prod file is a violation", () => {
  const root = fixture({
    "index.ts": `export const home = process.env.HOME;\n`,
  });
  const report = collectSeamViolations({ root, prod: [] });
  expect(report.ambient).toEqual([{ file: "index.ts", what: "ambient env / auth" }]);
});

test("test files get the test allowlist and are exempt from ambient rules", () => {
  const root = fixture({
    // a test file may import bun:test and the package's own name, and touch env
    "__tests__/it.test.ts": `import { test } from "bun:test";\nimport { a } from "@me/pkg";\nconst h = process.env.HOME;\n`,
  });
  expect(
    collectSeamViolations({ root, prod: [], test: ["@me/pkg"] }),
  ).toEqual({ imports: [], ambient: [] });
});

test("relative imports are always allowed", () => {
  const root = fixture({
    "index.ts": `import { a } from "../sibling/thing.ts";\nexport const b = a;\n`,
  });
  expect(collectSeamViolations({ root, prod: [] }).imports).toEqual([]);
});

test("assertSeam throws SeamViolationError on a broken claim, passes when clean", () => {
  const bad = fixture({ "index.ts": `import x from "lodash";\nexport default x;\n` });
  expect(() => assertSeam({ root: bad, prod: [] })).toThrow(SeamViolationError);

  const good = fixture({ "index.ts": `export const ok = 1;\n` });
  expect(() => assertSeam({ root: good, prod: [] })).not.toThrow();
});

test("custom ambient rules override the defaults", () => {
  const root = fixture({ "index.ts": `const r = Math.random();\nexport const q = r;\n` });
  const report = collectSeamViolations({
    root,
    prod: [],
    forbidAmbient: [[/\bMath\.random\b/, "nondeterminism"]],
  });
  expect(report.ambient).toEqual([{ file: "index.ts", what: "nondeterminism" }]);
});
