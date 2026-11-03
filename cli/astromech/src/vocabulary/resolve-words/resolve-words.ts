import { LEGACY_NAMES } from "../legacy-names/index.js";
import { resolveTaskName } from "../resolve-task-name/index.js";
import { SUITES } from "../suites/index.js";
import type { ResolvedWords } from "./resolve-words.type.js";

/**
 * Reads `holocron run <words…>` the way spec `ci-flat-task-vocabulary` describes: the words are joined with `:` and the
 * longest match against the registry wins, so `test unit` and `test:unit` are one call and `deploy preview` is
 * `deploy-preview`. Whatever is left is the existing `[job]` argument (`test unit storybook` leaves `storybook`). A
 * single old dotted name resolves through {@link LEGACY_NAMES}.
 */
export function resolveWords(words: string[]): ResolvedWords {
	for (let length = words.length; length > 0; length--) {
		const candidate = words.slice(0, length).join(":");
		const rest = words.slice(length);
		if (SUITES.includes(candidate)) return { kind: "suite", suite: candidate, rest };
		const targets = resolveTaskName(candidate);
		if (targets.length > 0) {
			return LEGACY_NAMES[candidate]
				? { kind: "task", targets, rest, legacy: candidate }
				: { kind: "task", targets, rest };
		}
	}
	return { kind: "unknown" };
}
