import type { StatusContext } from "@theholocron/astromech";
import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";

/** What decides the files `setup` and `sync` write to disk: the config and the checkout, and nothing remote. */
export interface RepoFilesInput {
	loaded: LoadedConfig;
	/** The directory the config was loaded for (`--cwd`); the git root is found from it. */
	repoRoot: string;
	/** `--hooks` / `--no-hooks`; `undefined` defers to `config.hooks`, then to `protection: "strict"`. */
	hooks?: boolean;
	/**
	 * The commit statuses a `coverage` provider posts (`coverageStatusContexts()`), for the `ci` aggregate caller. Left
	 * out when no provider is loaded (the generators need none), and the task runner then keeps its default.
	 */
	statusContexts?: readonly StatusContext[];
	/**
	 * Makes the config files a `coverage` provider writes (`coverageConfigFiles()`), as text by path. Left out when no
	 * provider is loaded: no coverage config is then written (a skipped step), so this function still needs no provider.
	 */
	coverageConfigFiles?: () => Record<string, string>;
	logger?: Logger;
}

/** A file the commands write, with what each of them calls the step. */
export interface GeneratedRepoFile {
	kind: "file";
	/** Relative to the checkout (`repoRoot`), `/`-separated. */
	path: string;
	content: string;
	/** The step name `setup` reports. */
	step: string;
	/** The step name `sync` reports. */
	syncStep: string;
	/** Shown beside the step when it succeeds. */
	note?: string;
	/** Set for a thin-caller workflow: the task it belongs to and its file name, for the package-collision check. */
	workflow?: { task: string; filename: string };
}

/** A thin-caller workflow: a generated file that always names its task and file name. */
export interface GeneratedWorkflowFile extends GeneratedRepoFile {
	workflow: { task: string; filename: string };
}

/** A file that is deliberately not written, and why. */
export interface SkippedRepoFile {
	kind: "skip";
	step: string;
	syncStep: string;
	message: string;
}

/** A file that could not be generated, so the step fails instead of the whole run. */
export interface FailedRepoFile {
	kind: "error";
	step: string;
	syncStep: string;
	message: string;
}

export type RepoFileEntry = GeneratedRepoFile | SkippedRepoFile | FailedRepoFile;
