import type { MenuEntry } from "../menu-entry/index.js";

/** A CLI's command catalog: the entries in menu order, and a lookup by full name. See {@link createCommandRegistry}. */
export interface CommandRegistry<E extends MenuEntry = MenuEntry> {
	/** Every entry, in the order they were declared (the order the menu lists them in). */
	entries: E[];
	/** The entry for a full command name (`"auth set"`); throws when there is none. */
	getEntry(name: string): E;
}
