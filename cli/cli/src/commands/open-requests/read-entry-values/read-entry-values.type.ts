import type { GitExec } from "@theholocron/git-utils";

import type { Vault } from "../../../plugin/index.js";

/** What {@link readEntryValues} needs. */
export interface ReadEntryValuesInput {
	/** A vault that can read an Environment's entries (`readEnvironmentEntries`). */
	vault: Vault;
	/** The layer word or the Environment name the person asked for. */
	environment: string;
	/** The Environment names the config names: a literal name must be one of them. */
	configured: string[];
	/** The repo root, to build `<org/repo> - <layer>` from its `origin` remote. */
	repoRoot: string;
	/** The entry names to take; every other entry is dropped. */
	names: string[];
	/** Reads the remote; defaults to git. */
	gitExec?: GitExec;
}

/** What {@link readEntryValues} found. */
export interface ReadEntryValuesResult {
	/** The Environment that was read, e.g. `acme/app - dev`. */
	environmentId: string;
	/** The named entries that hold a value. Never print or log them. */
	values: Map<string, string>;
	/** The named entries the Environment lacks or holds blank. */
	missing: string[];
}
