import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../../config/index.js";
import type { PluginLoader, Projects, RuntimeContext } from "../../../plugin/index.js";
import type { TemplatesIo } from "../load-templates/index.js";
import type { ProjectOptions } from "../project-options/index.js";
import type { ProjectPrompt } from "../terminal-prompt/index.js";

/** What every `holocron project` subcommand takes. */
export interface ProjectRunInput {
	/** The loaded config: its `projects` provider is the one used. */
	loaded: LoadedConfig;
	/** The runtime context (dry run, tokens, org). */
	context: RuntimeContext;
	/** Whoever owns the boards, when the `--org` flag says so; wins over `providers.projects` and the config's org. */
	owner?: string | undefined;
	/** The plugin loader. Defaults to one for `loaded`. */
	loader?: PluginLoader | undefined;
	/** The template files' file system. Defaults to the real one under the repo root. */
	io?: TemplatesIo | undefined;
	/** How a person is asked. Defaults to the terminal. */
	prompt?: ProjectPrompt | undefined;
	/** Where the rows go. Defaults to stdout. */
	print?: ((line: string) => void) | undefined;
	/** Structured-logging sink. Defaults to the command-bound root. */
	logger?: Logger | undefined;
}

/** What {@link openProjects} resolved. */
export interface OpenedProjects {
	/** The `projects` provider. */
	projects: Projects;
	/** The provider's options, resolved. */
	options: ProjectOptions;
}

/** What a `holocron project` subcommand did. */
export interface ProjectReport {
	/** `fail` when a step failed, otherwise `ok`. */
	status: "ok" | "fail";
	/** Rows that succeeded, failed and were skipped, for the summary line. */
	summary: { ok: number; fail: number; skip: number };
}
