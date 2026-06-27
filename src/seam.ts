// The seam-check harness — the reusable core behind every package's
// extractability test. A capability package declares the bare import specifiers
// it is allowed to touch (its CLAIM); this computes the violations of that claim:
// imports outside the allowlist, and ambient authority (subprocess / env) in
// production files.
//
// Pure except for reading the scanned package's own `*.ts` source via `node:fs`
// — the one ambient it needs, which it declares in its own seam test. No spawn,
// no env, no network.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** An import that falls outside a package's declared allowlist. */
export interface SeamViolation {
  /** Path relative to the scanned `root`. */
  readonly file: string;
  /** The disallowed bare import specifier. */
  readonly spec: string;
}

/** An ambient-authority use found in a production file. */
export interface AmbientViolation {
  /** Path relative to the scanned `root`. */
  readonly file: string;
  /** Which ambient-authority pattern matched (its label). */
  readonly what: string;
}

/** The result of checking a package against its seam claim. */
export interface SeamReport {
  /** Imports outside the allowlist. */
  readonly imports: SeamViolation[];
  /** Ambient-authority uses in production files. */
  readonly ambient: AmbientViolation[];
}

/** An ambient-authority pattern paired with its human-readable label. */
export type AmbientRule = readonly [pattern: RegExp, label: string];

/**
 * The default ambient authority a capability leaf must NOT hold: spawning
 * subprocesses or reading the ambient environment. A package routes those
 * through the `proc` / `env` seams instead. Override via
 * {@link SeamOptions.forbidAmbient} when a package's contract differs.
 */
export const DEFAULT_AMBIENT_RULES: readonly AmbientRule[] = [
  [/\bchild_process\b/, "child_process"],
  [/\bspawnSync\b|\bBun\.spawn\b|\bexecSync\b|\bexecFileSync\b/, "process spawn"],
  [/\bDeno\.Command\b/, "Deno subprocess"],
  [/\bprocess\.env\b|\bBun\.env\b/, "ambient env / auth"],
];

/** Specifiers every TEST file may use regardless of the prod allowlist. */
export const DEFAULT_TEST_ALLOWLIST: readonly string[] = [
  "bun:test",
  "node:os",
  "node:url",
  "node:path",
];

export interface SeamOptions {
  /** Absolute path to the module source root; scanned recursively for `*.ts`. */
  readonly root: string;
  /**
   * Bare import specifiers allowed in PRODUCTION (non-test) files. Relative
   * imports (`./…`, `../…`) are always allowed. This list IS the package's seam
   * claim — keep it small and meaningful.
   */
  readonly prod: readonly string[];
  /**
   * Extra specifiers allowed only in TEST files, ON TOP of `prod` and
   * {@link DEFAULT_TEST_ALLOWLIST} (e.g. the package's own name for round-trip
   * tests). Tests are exempt from the ambient rules.
   */
  readonly test?: readonly string[];
  /**
   * Forbid ambient-authority patterns in production files. `true` (default) uses
   * {@link DEFAULT_AMBIENT_RULES}; pass an array to override the rule set;
   * `false` to skip the ambient check entirely.
   */
  readonly forbidAmbient?: boolean | readonly AmbientRule[];
  /**
   * Classify a file path as a test file (gets the test allowlist, exempt from
   * ambient rules). Default: the path contains `/__tests__/` or ends `.test.ts`.
   */
  readonly isTestFile?: (file: string) => boolean;
}

// Matches `import … from "spec"` and `export … from "spec"`, value or type.
const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]/g;

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listTsFiles(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

function defaultIsTestFile(file: string): boolean {
  return file.includes("/__tests__/") || file.endsWith(".test.ts");
}

function ambientRulesFrom(
  forbid: SeamOptions["forbidAmbient"],
): readonly AmbientRule[] {
  if (forbid === false) return [];
  if (forbid === undefined || forbid === true) return DEFAULT_AMBIENT_RULES;
  return forbid;
}

/**
 * Compute a package's seam violations: imports outside its allowlist, and
 * ambient-authority uses in its production files. Pure given the file tree at
 * `root`. An empty report (`{ imports: [], ambient: [] }`) means the package
 * upholds its claim.
 */
export function collectSeamViolations(opts: SeamOptions): SeamReport {
  const isTest = opts.isTestFile ?? defaultIsTestFile;
  const prod = new Set(opts.prod);
  const testAllow = new Set<string>([
    ...prod,
    ...DEFAULT_TEST_ALLOWLIST,
    ...(opts.test ?? []),
  ]);
  const ambientRules = ambientRulesFrom(opts.forbidAmbient);

  const imports: SeamViolation[] = [];
  const ambient: AmbientViolation[] = [];

  for (const file of listTsFiles(opts.root)) {
    const fileIsTest = isTest(file);
    const allowlist = fileIsTest ? testAllow : prod;
    const source = readFileSync(file, "utf8");
    const rel = relative(opts.root, file);

    for (const match of source.matchAll(IMPORT_RE)) {
      const spec = match[1]!;
      if (spec.startsWith(".")) continue; // relative imports are always in-package
      if (allowlist.has(spec)) continue;
      imports.push({ file: rel, spec });
    }

    if (!fileIsTest) {
      for (const [pattern, label] of ambientRules) {
        if (pattern.test(source)) ambient.push({ file: rel, what: label });
      }
    }
  }

  return { imports, ambient };
}

/** Thrown by {@link assertSeam} when a package breaks its seam claim. */
export class SeamViolationError extends Error {
  constructor(readonly report: SeamReport) {
    const lines = [
      ...report.imports.map((v) => `  import  ${v.file} → "${v.spec}" (outside allowlist)`),
      ...report.ambient.map((v) => `  ambient ${v.file} → ${v.what}`),
    ];
    super(`seam claim broken (${lines.length} violation(s)):\n${lines.join("\n")}`);
    this.name = "SeamViolationError";
  }
}

/**
 * Assert a package upholds its seam claim, throwing a {@link SeamViolationError}
 * (surfaced by any test runner) when it does not. Framework-agnostic — call it
 * inside a `test(...)` of your choice:
 *
 * ```ts
 * import { test } from "bun:test";
 * import { assertSeam } from "@bounded-systems/seam-check";
 * test("seam", () => assertSeam({ root: SRC, prod: ["node:fs", "node:path"] }));
 * ```
 */
export function assertSeam(opts: SeamOptions): void {
  const report = collectSeamViolations(opts);
  if (report.imports.length > 0 || report.ambient.length > 0) {
    throw new SeamViolationError(report);
  }
}
