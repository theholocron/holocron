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

const RULES: Record<Permission, Rule> = { read: "required", ingest: "required", query: "absent" };

/**
 * What each layer's Axiom token is meant to carry, the same as "What each Axiom token needs" in
 * `docs/src/content/docs/tokens.mdx`. Every layer ships to the same dataset and only passes the environment as a field,
 * so it is one token with the same permissions everywhere: it ingests (the logger) and reads the dataset (`doctor
 * logs`), and does not query, because nothing in the repo reads logs back, so a leaked token cannot either. The probe
 * still tries query, so a token that can is flagged. This is the plugin's `tokens` declaration, read through
 * `tokenExpectations()`; change it and that table together.
 */
export const EXPECTED: TokenExpectation = {
	permissions: { local: RULES, dev: RULES, ci: RULES, prod: RULES },
};
