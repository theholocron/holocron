/**
 * The names a package's docs page can have: its folder name, and that name without the `-client` or
 * `holocron-plugin-` part its page drops (`clients/axiom-client` is the page `clients/axiom.mdx`).
 */
export function pageNames(dir: string): string[] {
	const name = dir.slice(dir.lastIndexOf("/") + 1);
	return [...new Set([name, name.replace(/-client$/, ""), name.replace(/^holocron-plugin-/, "")])];
}
