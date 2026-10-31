import type { DeclaredVsActualOptions } from "./doctor-checks.type.js";

/**
 * Compares what the config declares with what exists, both as maps by key, and returns one problem line per
 * difference: a declared key that is missing, a key found but not declared, a key whose values disagree.
 * An empty list means they match. A deep check is then a list of these comparisons, not a renderer of its own.
 */
export function declaredVsActual<T>(
	declared: ReadonlyMap<string, T>,
	actual: ReadonlyMap<string, T>,
	options: DeclaredVsActualOptions<T>
): string[] {
	const equal = options.equal ?? ((a: T, b: T) => a === b);
	const show = options.show ?? ((value: T) => String(value));
	const problems: string[] = [];
	for (const [key, want] of declared) {
		if (!actual.has(key)) {
			problems.push(`missing ${options.noun} ${key}`);
			continue;
		}
		const found = actual.get(key) as T;
		if (!equal(want, found)) {
			problems.push(`${options.noun} ${key}: declared ${show(want)}, found ${show(found)}`);
		}
	}
	if (options.flagExtra !== false) {
		for (const key of actual.keys()) {
			if (!declared.has(key)) problems.push(`unexpected ${options.noun} ${key}`);
		}
	}
	return problems;
}
