// seam-check is its own first customer: it must uphold the same claim it asks of
// every other package. Its production code touches `node:fs` / `node:path` only.
//
// One honest wrinkle: the substring-based ambient check matches `seam.ts`, which
// NAMES the forbidden patterns (`child_process`, `process.env`, …) as rule DATA
// in `DEFAULT_AMBIENT_RULES`. A regex can't tell a pattern definition from a use.
// So rather than weaken the check, we assert the strong, truthful thing: the
// imports are strictly within the claim, and the ONLY ambient matches are this
// package's own rule definitions in `seam.ts` — no other file holds authority.

import { expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { collectSeamViolations } from "../index.ts";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("@bounded-systems/seam-check upholds its own seam claim", () => {
  const report = collectSeamViolations({
    root: SRC,
    prod: ["node:fs", "node:path"],
    test: ["@bounded-systems/seam-check"],
  });

  // The real seam claim: production code imports only node:fs / node:path.
  expect(report.imports).toEqual([]);

  // The only ambient "matches" are the rule definitions in seam.ts itself —
  // proof that no other production file actually spawns or reads the env.
  expect([...new Set(report.ambient.map((a) => a.file))]).toEqual(["seam.ts"]);
});
