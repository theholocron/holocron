import { resolve } from "node:path";

import { loadConfigPath } from "@theholocron/datapad";
import { describeError } from "@theholocron/kyber/ui";

import { ConfigError, type ProviderOptions } from "../../../config/index.js";
import { parseOptionPairs } from "../../parse-option-pairs/index.js";

/** A `--with` value that is `key=value` text rather than a file path. */
const PAIR = /^[A-Za-z][\w-]*=/;

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Reads the values of `--with` into one provider options object. Each value is either a `key=value` pair
 * (`team=ENG`, text) or the path of a file (`.json`, or `.ts`, `.js`, `.mjs`, `.cjs` with the options object as its
 * default export), relative to `cwd`. They are laid over each other in the order given, one key at a time, so a later
 * value wins and a nested object is replaced whole, not merged. Returns `undefined` when `--with` was not given at
 * all, which is not the same as `{}`: it is how the command knows the options come from the config alone.
 *
 * A missing or unreadable file, or one whose value is not an object, is a {@link ConfigError} naming the file.
 *
 * @param values - What `--with` was given, in order.
 * @param cwd - The directory a relative path is resolved against.
 */
export async function readWithOptions(
	values: readonly string[] | undefined,
	cwd: string
): Promise<ProviderOptions | undefined> {
	if (!values || values.length === 0) return undefined;
	let options: ProviderOptions = {};
	for (const value of values) {
		if (PAIR.test(value)) {
			options = { ...options, ...parseOptionPairs(value, "--with") };
			continue;
		}
		const filepath = resolve(cwd, value);
		let loaded: unknown;
		try {
			loaded = await loadConfigPath(filepath);
		} catch (err) {
			throw new ConfigError(`--with ${value}: ${describeError(err)}`);
		}
		if (!isObject(loaded)) {
			throw new ConfigError(`--with ${value}: must hold an object of the provider's options`);
		}
		options = { ...options, ...loaded };
	}
	return options;
}
