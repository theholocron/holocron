/**
 * Lints one commit message string against an already-loaded commitlint
 * config. The genuinely environment-independent half of commit-message
 * linting (holocron#789) — *obtaining* a `QualifiedConfig` differs by
 * caller (Sentinel isolates itself from any ambient config since it runs
 * standalone, away from a real repo checkout; `lintCommitMsgFile` below
 * just lets cosmiconfig discover the invoking repo's own
 * `commitlint.config.*`, matching `commitlint --edit`'s own contract) —
 * but linting one message against a loaded config is identical either way.
 *
 * Real `@commitlint/lint` — the same programmatic API `@commitlint/cli`
 * itself uses internally — never a reimplementation of commitlint's rules.
 */

import lint from "@commitlint/lint";
import type { LintOptions, ParserPreset, QualifiedConfig } from "@commitlint/types";

export interface CommitMessageViolation {
	/** Rule name, e.g. `"subject-empty"`. */
	rule: string;
	/** commitlint's own message for the failure, e.g. `"subject may not be empty"`. */
	message: string;
}

/** `parserPreset.parserOpts`, if the loaded config sets one — same lookup `@commitlint/cli`'s own `selectParserOpts()` does. */
function selectParserOpts(parserPreset: ParserPreset | undefined): ParserPreset["parserOpts"] {
	return parserPreset?.parserOpts;
}

export async function lintCommitMessage(message: string, loaded: QualifiedConfig): Promise<CommitMessageViolation[]> {
	const opts: LintOptions = {
		// `@theholocron/commitlint-config` sets no parserPreset of its own
		// (relies on commitlint's built-in default parser) or a non-empty
		// `ignores` today beyond the one dependabot-bump matcher it does set —
		// both `?? {}`/`?? []` are real fallbacks for a config that could set
		// either, not dead code, even though this org's own shared config
		// never exercises the "unset" side for `ignores` and never exercises
		// the "set" side for `parserPreset`.
		/* istanbul ignore next -- see comment above */
		parserOpts: selectParserOpts(loaded.parserPreset) ?? {},
		plugins: loaded.plugins,
		/* istanbul ignore next -- see comment above */
		ignores: loaded.ignores ?? [],
		defaultIgnores: loaded.defaultIgnores !== false,
	};

	const outcome = await lint(message, loaded.rules, opts);
	if (outcome.valid) return [];
	return outcome.errors.map((error) => ({ rule: error.name, message: error.message }));
}
