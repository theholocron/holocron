import type { CheckRow, CheckStatus, CheckSummary } from "@theholocron/kyber/ui";
import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../plugin/index.js";

/** One file of `.github/workflows`, as `doctor ci` reads it. */
export interface CiWorkflowFile {
	/** The file name, `ci.test-unit.yml`. */
	file: string;
	/** Its text. */
	text: string;
}

/** What `doctor ci` reads from the filesystem, so a test can supply it without a disk. */
export interface CiIo {
	/** Every `*.yml` file in `.github/workflows`, in any order; empty when the folder is missing. */
	workflows(): CiWorkflowFile[];
}

/** One job of a generated caller. */
export interface CallerJob {
	/** The key under `jobs:`. */
	id: string;
	/** Its `name:`, when it has one. */
	name?: string;
	/** The reusable workflow it calls. */
	uses: string;
}

/** A generated thin caller, read from its text. */
export interface ParsedCaller {
	/** The file name. */
	file: string;
	/** The workflow's top-level `name:`. */
	name?: string;
	/** Its jobs that call a reusable workflow. */
	jobs: CallerJob[];
	/** The `expected` input of the `ci` aggregate, when the file has one. */
	expected?: string[];
}

/** Where a caller's reusable workflow is hosted. */
export type CallerHome = "legacy" | "ci-v1" | "local" | "other";

/** What `doctor ci` needs to run. */
export interface RunDoctorCiInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	loader?: PluginLoader;
	print?: (line: string) => void;
	logger?: Logger;
	/** The workflow files; defaults to the ones under `context.repoRoot`. */
	io?: CiIo;
	/** Whether generated callers still keep their old names (`legacyGate()` in astromech); the default reads it. */
	legacyGate?: boolean;
}

/** How a `doctor ci` run ended. */
export interface DoctorCiReport {
	/** `fail` if any row failed, otherwise `ok`: the tasks row always runs, so a run is never all skips. */
	status: CheckStatus;
	rows: CheckRow[];
	summary: CheckSummary;
}
