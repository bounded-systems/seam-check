// @bounded-systems/seam-check — the one sanctioned way to declare and prove a
// package's seam claim (its allowed imports + no ambient authority), plus the
// coverage meta-check that makes "every package has a claim" enforceable.
//
// The allowlist a package passes IS its claim; this package turns that claim
// into a mechanical, CI-enforced fact — the trust-center thesis as tooling.

export {
  type AmbientRule,
  type AmbientViolation,
  type SeamOptions,
  type SeamReport,
  type SeamViolation,
  DEFAULT_AMBIENT_RULES,
  DEFAULT_TEST_ALLOWLIST,
  SeamViolationError,
  assertSeam,
  collectSeamViolations,
} from "./seam.ts";

export {
  type CoverageOptions,
  UncheckedPackagesError,
  assertAllPackagesChecked,
  findUncheckedPackages,
} from "./coverage.ts";
