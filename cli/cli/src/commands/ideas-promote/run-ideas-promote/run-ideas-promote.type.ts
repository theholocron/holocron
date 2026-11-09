import type { CheckRow } from "@theholocron/kyber/ui";

import type { LoadedConfig } from "../../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../../plugin/index.js";

/** The disk access {@link runIdeasPromote} needs; tests inject a fake. */
export interface PromoteIo {
	/** Whether a file exists at an absolute path. */
	exists(path: string): boolean;
	/** Writes a file, making its folder when it is missing. */
	write(path: string, content: string): void;
}

/** What {@link runIdeasPromote} needs. */
export interface RunIdeasPromoteInput {
	/** The issue to promote, in the tracker's syntax (`#1234`, `1234`, `RANDO-7`); the `issues` provider reads it. */
	issue: string;
	/** The whole spec name, without `.spec.md`. Defaults to `tech-` and the title in kebab-case. */
	name?: string;
	/** The repo's config: its `issues` provider. */
	loaded: LoadedConfig;
	/** The runtime context; `dryRun` previews the file and writes nothing. `repoRoot` holds `.notes/`. */
	context: RuntimeContext;
	/** Write without asking. */
	yes?: boolean;
	/** Defaults to a loader over the config's `issues` provider. */
	loader?: PluginLoader;
	/** Defaults to the real disk. */
	io?: PromoteIo;
	/** Whether a terminal can be asked. Defaults to whether stdin is one. */
	interactive?: boolean;
	/** Asks the yes/no question. Defaults to an inquirer prompt. */
	confirm?: (message: string) => Promise<boolean>;
	/** Where the lines go. Defaults to the console. */
	print?: (line: string) => void;
}

/** How an `ideas promote` run went. */
export interface IdeasPromoteReport {
	/** `fail` if a row failed, `cancelled` when the person said no, otherwise `ok`. */
	status: "ok" | "fail" | "cancelled";
	/** The row for the run. */
	rows: CheckRow[];
	/** The spec's path relative to the repo root, when one was settled. */
	path?: string;
}
