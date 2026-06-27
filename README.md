# @bounded-systems/seam-check

> Declare a package's **seam claim** — the imports it's allowed to touch and the
> ambient authority it must not hold — and prove it mechanically in CI.

Every `@bounded-systems/*` capability package claims to be "the one sanctioned
access point" for its domain: `fs` is the only place `node:fs` lives, `proc` the
only subprocess spawn point, and so on. That claim is only true if something
enforces it. This package is that something — and the allowlist you pass **is**
the claim, turned into a fact.

It replaces the hand-rolled `extractability.test.ts` that each package used to
copy-paste (list files → parse imports → check an allowlist), so the harness is
fixed once and the claim stays a small, declarative spec.

## Use

```ts
import { test } from "bun:test";
import { assertSeam } from "@bounded-systems/seam-check";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("@bounded-systems/fs upholds its seam claim", () => {
  assertSeam({
    root: SRC,
    prod: ["node:fs", "node:path"], // the claim: prod code touches only these
    test: ["@bounded-systems/fs"], // extra specifiers test files may use
  });
});
```

`assertSeam` throws a descriptive `SeamViolationError` (surfaced by any test
runner) when a production file imports outside the allowlist or holds ambient
authority — subprocess spawn or `process.env`. Relative imports are always
allowed; test files get a wider allowlist and are exempt from the ambient rules.

Need the data instead of an assertion? `collectSeamViolations(opts)` returns
`{ imports, ambient }` for inspection.

## Close the gap, don't just patch it

A per-package check only proves the packages that *have* one. Escapes hide in the
packages with **no check at all**. The coverage meta-check makes that
un-mergeable:

```ts
import { test } from "bun:test";
import { assertAllPackagesChecked } from "@bounded-systems/seam-check";

test("every package declares a seam claim", () => {
  assertAllPackagesChecked({
    packagesDir: resolve(import.meta.dir, "../../packages"),
    exempt: ["fixtures"],
  });
});
```

A package counts as checked when one of its `*.test.ts` files imports this
package. Add a package without a seam claim and CI fails.

## API

| Export | Purpose |
|---|---|
| `assertSeam(opts)` | Throw `SeamViolationError` if a package breaks its claim. |
| `collectSeamViolations(opts)` | The pure check — returns `{ imports, ambient }`. |
| `assertAllPackagesChecked(opts)` | Throw `UncheckedPackagesError` if any package has no seam check. |
| `findUncheckedPackages(opts)` | The pure coverage check — returns the gap as a list. |
| `DEFAULT_AMBIENT_RULES` · `DEFAULT_TEST_ALLOWLIST` | The defaults, for extension. |

`SeamOptions`: `root`, `prod`, `test?`, `forbidAmbient?` (`true` | rules |
`false`), `isTestFile?`.

## Design

Pure but for reading the scanned package's own `*.ts` source (`node:fs`) — it
holds no ambient authority of its own and is its own first customer
(`self-seam.test.ts`). Node / Deno / Bun compatible; no test-framework
dependency in the published surface, so the assertion stays the consumer's.

MIT.
