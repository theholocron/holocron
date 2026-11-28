import search from "@inquirer/search";

import type { MenuItem } from "./menu.type.js";

/**
 * Searchable autocomplete over one menu level's `items`. `select()` would work too
 * at these list sizes, but `search()` degrades gracefully as the surface grows and
 * costs nothing when it doesn't. Resolves to the picked item's `value`.
 */
export async function pickMenuItem(items: MenuItem[], message = "What would you like to do?"): Promise<string> {
	return search<string>({
		message,
		source: (term) => searchChoices(items, term),
	});
}

/**
 * `@inquirer/search`'s `source` callback, factored out as a plain function —
 * unit-testable directly instead of only through a mocked `search()` call.
 * Empty/undefined `term` (nothing typed yet) returns every item.
 */
export function searchChoices(
	items: MenuItem[],
	term: string | undefined
): Array<{ name: string; value: string; description: string; short: string }> {
	const needle = term?.toLowerCase();
	const pool = !needle ? items : items.filter((i) => i.haystack.includes(needle));
	// Name-prefix hits, then other name hits, then description-only hits (stable, so
	// registry order holds within each bucket): typing `repo` should land on the `repo`
	// group, not on `clone` whose description says "repo", and `up` on `upgrade`, not `setup`.
	const rank = (i: MenuItem): number => {
		if (!needle) return 0;
		const name = i.name.toLowerCase();
		return name.startsWith(needle) ? 0 : name.includes(needle) ? 1 : 2;
	};
	return [...pool]
		.sort((a, b) => rank(a) - rank(b))
		.map((i) => ({
			name: i.name,
			value: i.value,
			description: i.description,
			// `name`'s trailing " ›" is a live-list-only signal ("this opens a
			// submenu") — once picked, `search()` echoes `short` on the "done"
			// line instead, so the chevron doesn't linger in the completed answer.
			short: i.name.replace(/ ›$/, ""),
		}));
}
