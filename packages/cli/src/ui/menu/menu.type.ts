/** A row in one level of a nested menu: a command to run, a group to open, or "back". */
export interface MenuItem {
	name: string;
	/** What the picker resolves to: a command name, `group:<path>` to open a submenu, or `back`. */
	value: string;
	description: string;
	/** Lower-cased text the search box matches against (a group includes everything under it). */
	haystack: string;
}
