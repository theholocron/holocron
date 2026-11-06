import type { CheckRow, CheckStatus, CheckSummary } from "@theholocron/kyber/ui";
import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext, Source } from "../../plugin/index.js";

/** Either why a scope could not be read, or the problems found there (none when it matches). */
export type VariableScopeResult = { skip: string } | { problems: string[]; checked: number };

/** One row of `holocron doctor variables`: a scope to read through the `source` provider and compare. */
export interface VariableScopeCheck {
	id: string;
	title: string;
	run(source: Source): Promise<VariableScopeResult>;
}

export interface RunDoctorVariablesInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	loader?: PluginLoader;
	print?: (line: string) => void;
	logger?: Logger;
}

export interface DoctorVariablesReport {
	/** `fail` if any row failed, `skip` if every row was skipped, otherwise `ok`. */
	status: CheckStatus;
	rows: CheckRow[];
	summary: CheckSummary;
	/** Why every row was skipped, when they were. */
	reason?: string;
}
