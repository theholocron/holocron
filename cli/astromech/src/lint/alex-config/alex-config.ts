/**
 * The org's canonical `alex` (inclusive-language) config, as raw parsed
 * data. The one canonical copy is `alexrc.json` beside this file. A central
 * Sentinel check (holocron#769/#793) reads it directly rather than fetching
 * each repo's own copy via the Contents API — the same "one config, not N
 * copies" reasoning `@theholocron/commitlint-config` already established for
 * commit-message linting. `holocron setup` no longer writes a per-repo
 * `.alexrc.json` or `.alexignore` (#831).
 */

import alexrc from "./alexrc.json" with { type: "json" };

/**
 * The org's canonical `alex` (inclusive-language) config as data: the words it allows, from the one JSON file
 * `alexrc.json` beside this module.
 */
export const ALEX_CONFIG: {
	/** The words `alex` accepts despite its default rules. */
	allow: string[];
} = alexrc;
