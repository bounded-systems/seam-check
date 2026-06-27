// Coverage meta-check: the structural half of closing seam escapes. A per-package
// seam test only proves the packages that HAVE one. The escapes hide in the
// packages with no check at all. `findUncheckedPackages` enumerates those, and
// `assertAllPackagesChecked` fails when any exist — so a new package cannot be
// merged without declaring its seam claim.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface CoverageOptions {
  /**
   * Directory whose immediate child directories are packages (each containing a
   * `package.json`). For a monorepo this is `packages/`; for a poly-repo this is
   * the workspace root holding the per-package repos.
   */
  readonly packagesDir: string;
  /**
   * A package counts as "checked" when one of its `*.test.ts` files references
   * this marker — i.e. imports the seam harness. Defaults to the package name,
   * `@bounded-systems/seam-check`.
   */
  readonly marker?: string;
  /** Package directory basenames exempt from requiring a seam check. */
  readonly exempt?: readonly string[];
}

const DEFAULT_MARKER = "@bounded-systems/seam-check";

function testFilesUnder(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...testFilesUnder(full));
    else if (full.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

/**
 * Package directories under `packagesDir` that ship a `package.json` but have no
 * seam check (no `*.test.ts` referencing the marker). An empty array means full
 * coverage — every package declares and proves a seam claim.
 */
export function findUncheckedPackages(opts: CoverageOptions): string[] {
  const marker = opts.marker ?? DEFAULT_MARKER;
  const exempt = new Set(opts.exempt ?? []);
  const unchecked: string[] = [];
  for (const entry of readdirSync(opts.packagesDir)) {
    if (exempt.has(entry)) continue;
    const pkgDir = join(opts.packagesDir, entry);
    if (!statSync(pkgDir).isDirectory()) continue;
    if (!existsSync(join(pkgDir, "package.json"))) continue;
    const checked = testFilesUnder(pkgDir).some((f) =>
      readFileSync(f, "utf8").includes(marker),
    );
    if (!checked) unchecked.push(entry);
  }
  return unchecked.sort();
}

/** Thrown by {@link assertAllPackagesChecked} when packages lack a seam check. */
export class UncheckedPackagesError extends Error {
  constructor(readonly packages: string[]) {
    super(
      `${packages.length} package(s) have no seam check (escapes can hide here):\n` +
        packages.map((p) => `  ${p}`).join("\n"),
    );
    this.name = "UncheckedPackagesError";
  }
}

/**
 * Assert every package under `packagesDir` declares a seam claim, throwing an
 * {@link UncheckedPackagesError} otherwise. The structural guard that makes the
 * coverage gap un-mergeable.
 */
export function assertAllPackagesChecked(opts: CoverageOptions): void {
  const unchecked = findUncheckedPackages(opts);
  if (unchecked.length > 0) throw new UncheckedPackagesError(unchecked);
}
