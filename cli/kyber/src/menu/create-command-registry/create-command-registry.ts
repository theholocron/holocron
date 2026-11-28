import type { MenuEntry } from "../menu-entry/index.js";
import type { CommandRegistry } from "./create-command-registry.type.js";

/**
 * Declare a CLI's commands once, as a list of {@link MenuEntry}, and get the catalog the menu and the prompts
 * read from: hand `entries` to {@link launchMenu}, and have a leaf command's handler call `getEntry(name)` to
 * prompt for just its own missing positionals (`promptForPositionals`).
 *
 * The list is kept in the order given. A repeated name is a mistake (the menu would list it twice and
 * `getEntry` could only reach the first), so it throws here, when the catalog is built, not at the prompt.
 *
 * @param entries - The commands, in menu order.
 * @param label - Names the catalog in error messages (default `"menu"`).
 * @throws When two entries share a name.
 */
export function createCommandRegistry<E extends MenuEntry>(entries: E[], label = "menu"): CommandRegistry<E> {
	const seen = new Set<string>();
	for (const { name } of entries) {
		if (seen.has(name)) throw new Error(`${label}: duplicate command registry entry "${name}"`);
		seen.add(name);
	}
	return {
		entries,
		getEntry(name) {
			const entry = entries.find((e) => e.name === name);
			if (!entry) throw new Error(`${label}: no command registry entry named "${name}"`);
			return entry;
		},
	};
}
