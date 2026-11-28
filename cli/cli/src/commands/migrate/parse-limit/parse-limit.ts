import { ConfigError } from "../../../config/index.js";

/**
 * Reads `--limit`: a positive whole number, or undefined when the flag was not given. Anything else (zero, a negative
 * number, a fraction, text) is a `ConfigError` that names the command and the value, so a typo never reads as "no limit".
 */
export function parseLimit(value: unknown, command: string): number | undefined {
	if (value === undefined) return undefined;
	const text = String(value).trim();
	if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(Number(text))) {
		throw new ConfigError(`${command}: --limit "${text}" is not a positive whole number`);
	}
	return Number(text);
}
