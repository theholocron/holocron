import { LEGACY_NAMES, SUITES } from "@theholocron/astromech";

/**
 * Each old task name astromech's `LEGACY_NAMES` still accepts, with the text the `tasks names` probe prints as its
 * replacement: the flat ids it became, in run order. A successor that adds args (`format --check`, the read-only
 * prettier half of `sourceQuality.formatting`) is named last, in parentheses: `lint:editorconfig, lint:markdown (format
 * for prettier)`. A name that is a suite now (`validate`, once the interim id of `platform.repoValidation`) is left out:
 * `holocron run validate` is the suite, not a leftover.
 */
export function legacyReplacements(): Record<string, string> {
	return Object.fromEntries(
		Object.entries(LEGACY_NAMES)
			.filter(([old]) => !SUITES.includes(old))
			.map(([old, targets]) => {
				const own = targets.filter((t) => t.passthrough === undefined).map((t) => t.id);
				const checked = targets.filter((t) => t.passthrough !== undefined).map((t) => `${t.id} for prettier`);
				return [old, checked.length === 0 ? own.join(", ") : `${own.join(", ")} (${checked.join(", ")})`];
			})
	);
}
