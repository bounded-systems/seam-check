import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  UncheckedPackagesError,
  assertAllPackagesChecked,
  findUncheckedPackages,
} from "../index.ts";

const made: string[] = [];
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "seam-cov-"));
  made.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

test("flags packages with no seam check, ignores the checked ones", () => {
  const dir = tree({
    "checked/package.json": `{"name":"@x/checked"}`,
    "checked/src/__tests__/seam.test.ts": `import { assertSeam } from "@bounded-systems/seam-check";`,
    "unchecked/package.json": `{"name":"@x/unchecked"}`,
    "unchecked/src/index.ts": `export const x = 1;`,
    "not-a-package/readme.md": `no package.json here`,
  });
  expect(findUncheckedPackages({ packagesDir: dir })).toEqual(["unchecked"]);
});

test("exempt packages are not required to have a check", () => {
  const dir = tree({
    "legacy/package.json": `{"name":"@x/legacy"}`,
    "legacy/src/index.ts": `export const x = 1;`,
  });
  expect(findUncheckedPackages({ packagesDir: dir, exempt: ["legacy"] })).toEqual([]);
});

test("a custom marker decides what counts as 'checked'", () => {
  const dir = tree({
    "p/package.json": `{"name":"@x/p"}`,
    "p/src/x.test.ts": `import { assertSeam } from "@acme/conformance";`,
  });
  expect(findUncheckedPackages({ packagesDir: dir, marker: "@acme/conformance" })).toEqual([]);
  expect(findUncheckedPackages({ packagesDir: dir })).toEqual(["p"]);
});

test("assertAllPackagesChecked throws with the offending names, passes when full", () => {
  const gap = tree({ "p/package.json": `{"name":"@x/p"}`, "p/src/i.ts": `export const x = 1;` });
  expect(() => assertAllPackagesChecked({ packagesDir: gap })).toThrow(UncheckedPackagesError);

  const full = tree({
    "p/package.json": `{"name":"@x/p"}`,
    "p/src/i.test.ts": `import "@bounded-systems/seam-check";`,
  });
  expect(() => assertAllPackagesChecked({ packagesDir: full })).not.toThrow();
});
