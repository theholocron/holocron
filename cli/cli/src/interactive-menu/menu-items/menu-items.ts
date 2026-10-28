import type { MenuItem } from "../../ui/index.js";
import type { CommandEntry } from "../command-registry/index.js";

/** Prefix of a menu item's `value` that opens a submenu rather than running a command. */
export const GROUP = "group:";
/** The "← back" item's value; only offered below the first level. */
export const BACK = "back";

/**
 * One level of the menu, derived from the registered command names: the next word
 * of every entry under `path` (`[]` is the top). A word is
 *
 * - a **command** when nothing is nested under it (`doctor`);
 * - a **group** when commands are nested under it (`repo` → `repo setup`, `repo sync`, …),
 *   which can nest as deep as the names go (`repo upgrade` → `repo upgrade node`);
 *
 * Every row is a single word, never a "<command> <subcommand>" path: `config show` is
 * `config ›` then `show`, even when a group holds just one command.
 *
 * A path that is itself runnable (`repo sync`, `deploy`) gets a leading "<word> (run it)" item.
 * Registration order is kept.
 */
export function menuItems(entries: CommandEntry[], path: string[] = []): MenuItem[] {
	const prefix = path.join(" ");
	const own = prefix ? entries.find((e) => e.name === prefix) : undefined;
	const under = prefix ? entries.filter((e) => e.name.startsWith(`${prefix} `)) : entries;
	const haystackOf = (list: CommandEntry[]): string =>
		list.map((e) => `${e.name} ${e.description}`.toLowerCase()).join(" ");

	const items: MenuItem[] = [];
	if (own) {
		items.push({
			name: `${path[path.length - 1]!} (run it)`,
			value: own.name,
			description: own.description,
			haystack: haystackOf([own]),
		});
	}
	const words = [...new Set(under.map((e) => e.name.split(" ")[path.length]!))];
	for (const word of words) {
		const full = [...path, word].join(" ");
		const family = under.filter((e) => e.name === full || e.name.startsWith(`${full} `));
		const self = family.find((e) => e.name === full);
		const nested = family.filter((e) => e.name !== full);
		if (nested.length === 0 && self) {
			items.push({
				name: self.opensMenu ? `${word} ›` : word,
				value: full,
				description: self.description,
				haystack: haystackOf([self]),
			});
		} else {
			const children = [...new Set(nested.map((e) => e.name.split(" ")[path.length + 1]!))];
			items.push({
				name: `${word} ›`,
				value: `${GROUP}${full}`,
				description: children.join(", "),
				haystack: haystackOf(family),
			});
		}
	}
	return items;
}
