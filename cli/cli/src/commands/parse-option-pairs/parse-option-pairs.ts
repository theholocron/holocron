import { ConfigError } from "../../config/index.js";

/**
 * Reads `key=value,key=value` into text options, for a flag that points a provider somewhere (`--from linear:team=ENG`,
 * `--with team=ENG`). Blank pairs are skipped; a pair with no `=`, or an empty key, is a {@link ConfigError} naming
 * `flag`. Values are text; a provider that wants more shape reads it from a config entry or a file.
 *
 * @param text - The pairs, comma separated.
 * @param flag - The flag the text came from, for the error message.
 */
export function parseOptionPairs(text: string, flag: string): Record<string, string> {
	const options: Record<string, string> = {};
	for (const pair of text.split(",").filter((p) => p.trim() !== "")) {
		const eq = pair.indexOf("=");
		if (eq <= 0) throw new ConfigError(`${flag}: "${pair}" is not key=value`);
		options[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
	}
	return options;
}
