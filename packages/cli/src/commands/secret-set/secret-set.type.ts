import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import { PluginLoader, type RuntimeContext, type SecretScope } from "../../plugin/index.js";

export type SecretSetPrint = (line: string) => void;

export interface RunSecretSetInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** Secret name (e.g., `NPM_TOKEN`). */
	name: string;
	/** Secret value. If absent, resolves via stdin / env. */
	value?: string;
	/** Read from stdin instead of positional or env var. */
	fromStdin?: boolean;
	/** Read from a specific env var rather than implicit-by-name. */
	fromEnv?: string;
	/** Defaults to `{ kind: 'repo' }`. */
	scope?: SecretScope;
	loader?: PluginLoader;
	print?: SecretSetPrint;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
	/** Lets tests inject a stdin reader. Defaults to reading process.stdin. */
	readStdin?: () => Promise<string>;
}

export interface SecretSetReport {
	status: "ok" | "fail" | "dry-run";
	name: string;
	scope: SecretScope;
	message?: string;
}
