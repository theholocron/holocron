import type { GitExec } from "@theholocron/git-utils";
import type { CheckRow, CheckStatus, CheckSummary } from "@theholocron/kyber/ui";
import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { EnvironmentLayer } from "../../credentials-environments/index.js";
import type { EnvironmentEntry, PluginLoader, RuntimeContext } from "../../plugin/index.js";

export interface RunDoctorSharedValuesInput {
	/** The loaded config: the `vault` provider and `doctor.sharedVariables`. */
	loaded: LoadedConfig;
	/** The runtime context; `repoRoot` is where the `origin` remote is read. */
	context: RuntimeContext;
	/** Defaults to a loader over the config. */
	loader?: PluginLoader;
	/** Runs git for the `origin` remote. Defaults to the real git; a test passes a fake. */
	gitExec?: GitExec;
	/** A secret shared between two layers is a failure, not an `info` row. */
	strict?: boolean;
	/** Names shared on purpose, besides `doctor.sharedVariables` (`--allow`). */
	allow?: string[];
	/** Where the rows and the closing count go. Defaults to the console. */
	print?: (line: string) => void;
	/** Structured-logging sink. Defaults to the command-bound root. */
	logger?: Logger;
}

export interface DoctorSharedValuesReport {
	/** `fail` if `--strict` and a secret is shared, `skip` if nothing could be compared or one is shared, otherwise `ok`. */
	status: CheckStatus;
	rows: CheckRow[];
	summary: CheckSummary;
	/** Why nothing was compared, when that is so. */
	reason?: string;
}

/** The entries one layer's Environment holds, secrets and variables. In memory only; never printed. */
export interface LayerSecrets {
	layer: EnvironmentLayer;
	environment: string;
	entries: EnvironmentEntry[];
}

/** What reading the layers gave: the ones that could be read, and a skipped row for each that could not. */
export interface LayerReads {
	layers: LayerSecrets[];
	rows: CheckRow[];
}

/** The variables `ci` has that `dev` lacks or holds differently, by name only. */
export interface VariableDrift {
	/** In `ci`, absent from `dev`. */
	missing: string[];
	/** In both, with different values. */
	differs: string[];
}

/** The secrets two layers share, by name only. */
export interface SharedPair {
	/** The later layer in `local, dev, ci, prod` order. */
	layer: EnvironmentLayer;
	/** The earlier one. */
	other: EnvironmentLayer;
	/** Names that hold the same value in both: `NAME`, or `LATER_NAME = EARLIER_NAME` when the names differ. */
	names: string[];
}
