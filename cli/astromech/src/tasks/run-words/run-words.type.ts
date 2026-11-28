import type { TasksConfig } from "../../config/schema/index.js";
import type { RunDeps } from "../run/index.js";

/** What `runWords` needs: the words after `holocron run`, the repo's manifest and how to scope the run. */
export interface RunWordsInput extends RunDeps {
	/** The positional words: the task or suite, then the qualifier or `[job]`, then any extra positionals. */
	words: string[];
	cwd: string;
	/** The manifest; a suite runs the leaves it lists. */
	config?: TasksConfig;
	/** Args after `--`, forwarded to the tool, turbo or script. */
	passthrough?: string[];
	/** The read-only form of a task that writes by default (`format --check`). */
	check?: boolean;
	dryRun?: boolean;
	required?: boolean;
	filter?: string;
	affected?: boolean;
	base?: string;
	env?: Record<string, string | undefined>;
	/** Where a deprecation notice goes (stderr). */
	warn: (line: string) => void;
}
