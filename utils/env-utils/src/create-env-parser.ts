import { debug } from "./debug.js";
import { DotenvLoader } from "./loader.js";
import type { EnvObject, EnvParser, EnvParserOptions } from "./types.js";
import { buildEnvObject, getByPath, normalizeKey } from "./utils/index.js";

/**
 * Create an env parser for your app.
 *
 * Call this once in your app's config.ts. Use get() to look up values
 * and map() to define your app's config shape in one place. Nothing
 * outside config.ts should ever touch process.env directly.
 *
 * @example
 * // src/config.ts
 * import { createEnvParser } from "@magnite/env-parser";
 *
 * const { map, deprecate } = createEnvParser({ appName: "adcp-service" });
 *
 * deprecate("database_url", "db__primary__url");
 *
 * export const config = map((get) => ({
 *   port: get("port") ?? 3000,
 *   db: {
 *     url: get("db.primary.url") ?? get("database_url"),
 *   },
 *   auth: get("auth0"), // returns the whole auth0 namespace object
 * }));
 */
export function createEnvParser<T extends EnvObject = EnvObject>(
	options: EnvParserOptions,
): EnvParser<T> {
	const {
		appName,
		loader = new DotenvLoader(),
		parseValues = true,
	} = options;

	const raw = loader.load();

	// buildEnvObject returns EnvObject; T extends EnvObject and is caller-supplied,
	// so this cast is the correct and minimal assertion needed here.
	const env = buildEnvObject(raw, parseValues) as T;

	debug.log(appName, env);

	function get(key: string): ReturnType<EnvParser<T>["get"]> {
		const path = normalizeKey(key);
		const value = getByPath(env, path);

		if (value === undefined) {
			debug.warn(appName, key);
		}

		return value;
	}

	return {
		get env(): T {
			return env;
		},

		get,

		map<C>(fn: (get: EnvParser<T>["get"]) => C): C {
			return fn(get);
		},

		deprecate(oldKey: string, newKey: string): void {
			debug.deprecate(appName, oldKey, newKey, env);
		},
	};
}
