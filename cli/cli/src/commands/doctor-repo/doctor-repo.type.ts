import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext, Source } from "../../plugin/index.js";
import type { CheckRow, CheckStatus, CheckSummary } from "../doctor-checks/index.js";

export interface RunDoctorRepoInput {
	/** The loaded config: its `repo` block, `description`, `homepage` and tasks say what the repository must look like. */
	loaded: LoadedConfig;
	/** The runtime context. */
	context: RuntimeContext;
	loader?: PluginLoader;
	/** Where the rows and the closing count go. Defaults to the console. */
	print?: (line: string) => void;
	/** Structured-logging sink. Defaults to the command-bound root. */
	logger?: Logger;
}

export interface DoctorRepoReport {
	/** `fail` if any row failed, `skip` if every row was skipped, otherwise `ok`. */
	status: CheckStatus;
	rows: CheckRow[];
	summary: CheckSummary;
	/** Why every row was skipped, when they were. */
	reason?: string;
}

/** Either why a group could not be read, or the problems found (none when it matches). */
export type RepoCheckResult = { skip: string } | { problems: string[]; checked: number };

/** One group of repository settings `repo setup` manages, compared with what the provider reports. */
export interface RepoCheck {
	id: string;
	title: string;
	/** The optional {@link Source} method this group is read with; the row is skipped when the provider lacks it. */
	needs: keyof Source;
	run(source: Source): Promise<RepoCheckResult>;
}
