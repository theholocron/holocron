import type { PermissionRule, TokenExpectation } from "@theholocron/cli";

/** A permission the probe tries, by the name its rows use. */
export type Permission = "read" | "ingest" | "query";

/** What a layer's token must do about a permission: `required` it must have it, `absent` it must not. */
export type Rule = PermissionRule;

/**
 * Datasets the logging setup retired (ADR-0019): one dataset per service now, split by the `env` field. A token that
 * still reaches one is shown, so a layer pointed at the wrong dataset (`holocron-local` on a laptop) is visible.
 */
export const RETIRED_DATASETS: readonly string[] = ["holocron-local", "holocron-ci", "holocron-global"];

const SHIPS_AND_READS: Record<Permission, Rule> = { read: "required", ingest: "required", query: "required" };

/**
 * What each layer's Axiom token is meant to carry, the same as "What each Axiom token needs" in
 * `docs/src/content/docs/tokens.mdx`: a laptop (`local` inherits `dev`) ships logs, reads datasets (`doctor logs`) and
 * queries them; CI only ships logs and checks its dataset, so a leak from CI cannot read the logs back. A layer not
 * listed (`prod`) has no declared expectations and its token is only reported. This is the plugin's `tokens`
 * declaration, read through `tokenExpectations()`; change it and that table together.
 */
export const EXPECTED: TokenExpectation = {
	permissions: {
		local: SHIPS_AND_READS,
		dev: SHIPS_AND_READS,
		ci: { read: "required", ingest: "required", query: "absent" },
	},
};
