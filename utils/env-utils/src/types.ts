export type Primitive = string | number | boolean;

export type EnvObject = {
	[key: string]: Primitive | EnvObject;
};

/**
 * Strategy interface for loading raw env vars.
 * Swap out dotenv for anything else without touching consumer code.
 */
export interface EnvLoader {
	load(): Record<string, string | undefined>;
}

export interface EnvParserOptions {
	/**
	 * Display name for this app — used in debug output.
	 * Should match your package.json `name` field.
	 */
	appName: string;

	/**
	 * Custom loader strategy. Defaults to DotenvLoader.
	 */
	loader?: EnvLoader;

	/**
	 * Whether to coerce "true"/"false"/numeric strings into their
	 * native types. Defaults to true.
	 */
	parseValues?: boolean;

	/**
	 * Namespace prefixes to filter and strip from raw env var keys.
	 * When set, only vars whose names start with one of these prefixes
	 * (case-insensitive, followed by `_`) are visible to the parser.
	 * The prefix is stripped before the key is normalised and looked up.
	 *
	 * Uses a **cascade model** — later entries win when the same key
	 * exists under multiple prefixes. Put broad/global namespaces first
	 * and project-specific overrides last (same mental model as CSS
	 * specificity or `Object.assign`).
	 *
	 * This lets you share an org-wide namespace (e.g. `HOLOCRON_` set
	 * once in `~/.bashrc`) as a base, then override individual vars with
	 * a project-specific prefix in `.env`, without copying every global
	 * var into each project.
	 *
	 * @example
	 * // HOLOCRON_DEBUG is the global default; CLI_TEMPLATE_DEBUG overrides it.
	 * createEnvParser({ appName: "my-cli", namespaces: ["HOLOCRON", "CLI_TEMPLATE"] })
	 *
	 * // Single namespace — only HOLOCRON_* vars are visible
	 * createEnvParser({ appName: "my-cli", namespaces: ["HOLOCRON"] })
	 *
	 * // Completely custom — no org namespace at all
	 * createEnvParser({ appName: "my-cli", namespaces: ["MY_TOOL"] })
	 */
	namespaces?: string[];
}

export interface EnvParser<T extends EnvObject = EnvObject> {
	/**
	 * The fully parsed env object. Exposed if you need direct access,
	 * but prefer get() for individual lookups.
	 */
	readonly env: T;

	/**
	 * Retrieve a value from the parsed env using any key syntax.
	 * All four forms resolve identically for nested keys:
	 *
	 *   get("SERVICE__DB__URL")  // uppercase + double underscore → traversal
	 *   get("service__db__url")  // lowercase + double underscore → traversal
	 *   get("service.db.url")    // dot syntax                    → traversal
	 *   get("service_db_url")    // single underscore             → flat key lookup
	 *
	 * Returns undefined and warns locally (via observe) if the key doesn't exist.
	 * Returns a nested EnvObject if the path resolves to a namespace rather than a leaf.
	 * The consuming app decides what to do with undefined — get() never crashes for you.
	 *
	 * @example
	 * // required — app enforces this, not the library
	 * const url = get("database_url");
	 * if (!url) throw new Error("DATABASE_URL is required");
	 *
	 * // optional with default
	 * const port = get("port") ?? 3000;
	 *
	 * // rename fallback
	 * const url = get("db.primary.url") ?? get("database_url");
	 */
	get(key: string): Primitive | EnvObject | undefined;

	/**
	 * Define your app's config shape in one place.
	 * Receives get() so every value is a resolved env lookup.
	 * Fallbacks between old and new key names are plain JS — no magic.
	 *
	 * @example
	 * export const config = parser.map((get) => ({
	 *   port: get("port") ?? 3000,
	 *   database: {
	 *     url: get("db.primary.url") ?? get("database_url"),
	 *   },
	 *   allm: get("allm.service"), // returns the whole nested object
	 * }));
	 */
	map<C>(fn: (get: EnvParser<T>["get"]) => C): C;

	/**
	 * Log a warning locally when an old key is still present, to remind
	 * you to finish a migration. No-ops in deployed environments.
	 *
	 * @example
	 * parser.deprecate("database_url", "db__primary__url");
	 */
	deprecate(oldKey: string, newKey: string): void;
}
