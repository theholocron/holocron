import type { Progress } from "@theholocron/kyber/ui";

import type { LoadedConfig } from "../../../config/index.js";
import type { ImportResult, IssueOrder, PluginLoader, RuntimeContext } from "../../../plugin/index.js";
import type { TemplatesIo } from "../../project/load-templates/index.js";
import type { MigrateScope } from "../collect-records/index.js";
import type { BoardPlacement } from "../place-on-board/index.js";
import type { DroppedTally } from "../tally-dropped/index.js";

/** What {@link runMigrate} needs. */
export interface RunMigrateInput {
	loaded: LoadedConfig;
	/** The runtime context; `dryRun` reads both sides and changes neither. */
	context: RuntimeContext;
	/** The source, as `provider` or `provider:key=value,...`. */
	from: string;
	/** The target, in the same form. */
	to: string;
	/** What to move. */
	scope: MigrateScope;
	/** Leave closed issues behind. */
	openOnly?: boolean;
	/** Read at most this many issues from the source, counted after `openOnly`. */
	limit?: number;
	/** With `limit`, which end of the creation order is read: `oldest` (the default) or `newest`. */
	order?: IssueOrder;
	/**
	 * Put every migrated issue in this milestone (GitHub) or project (Linear). A project scope moved to a target with no
	 * boards defaults it to the board's name; to a target with boards (GitHub) the board is made instead and the
	 * milestone is set only when this is given.
	 */
	milestone?: string;
	/** The board template a missing board is made from, when the target has boards. Defaults to `roadmap`. */
	template?: string;
	/** Where template files are read from. Defaults to the real file system. */
	templatesIo?: TemplatesIo;
	/** Migrate without asking. */
	yes?: boolean;
	/** Builds a loader for a side; tests pass one. */
	makeLoader?: (resolved: LoadedConfig["resolved"], context: RuntimeContext) => PluginLoader;
	/** Whether a terminal can be asked. Defaults to whether stdin is one. */
	interactive?: boolean;
	/** Asks the yes/no question. Defaults to an inquirer prompt. */
	confirm?: (message: string) => Promise<boolean>;
	/** Where the lines go. Defaults to the console. */
	print?: (line: string) => void;
	/**
	 * The spinner for the read and write phases. Defaults to kyber's, which draws only on a terminal; tests pass a fake
	 * to see the counter text.
	 */
	progress?: Progress;
}

/** What a migration did. */
export interface MigrateReport {
	/** `skip` when a provider cannot export or import, `cancelled` when the answer was no. */
	status: "ok" | "fail" | "skip" | "cancelled";
	/** One result per record, in order. */
	results?: ImportResult[];
	/** What the target could not hold, with how many issues lost it. */
	notCarried?: DroppedTally[];
	/** Where the issues went on the target's board, when the target has boards and the scope was one. */
	board?: BoardPlacement;
	/** The `limited to N of M` line, when the read was held to a limit. */
	limited?: string;
	/** Why it did not run, when that is so. */
	reason?: string;
}
