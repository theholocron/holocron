import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import { PluginLoader, type RuntimeContext, type SecretScope } from "../../plugin/index.js";

export type SecretsListPrint = (line: string) => void;

/** The `--scope` values. */
export type SecretsListScopeName = "repo" | "environment" | "organization";

export interface ListScopesInput {
	/** `--scope`. Omitted, the repository plus the organization and environment that were named. */
	scope?: SecretsListScopeName;
	/** `--env`: the environment to list. */
	env?: string;
	/** The organization to list: `--org`, then `HOLOCRON_ORG`, then the config's `org`. */
	org?: string;
}

/** The names found at one scope, or why they could not be listed. */
export interface SecretsListGroup {
	scope: SecretScope;
	/** The scope as it is printed: `repo`, `environment production`, `organization theholocron`. */
	label: string;
	/** Secret names (never values), sorted. Empty when `error` is set. */
	names: string[];
	/** Why the scope could not be listed. */
	error?: string;
}

export interface RunSecretsListInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** The scopes to list, in print order. */
	scopes: SecretScope[];
	/** Print one JSON document instead of the grouped text. */
	json?: boolean;
	loader?: PluginLoader;
	print?: SecretsListPrint;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
}

export interface SecretsListReport {
	groups: SecretsListGroup[];
	/** How many scopes could not be listed. */
	failed: number;
}
