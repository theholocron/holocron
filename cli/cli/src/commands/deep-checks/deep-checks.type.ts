import type { Logger } from "@theholocron/observability/core";
import type { CommandModule } from "yargs";

import type { LoadedConfig } from "../../config/index.js";
import type { CapabilityKey, PluginLoader, RuntimeContext } from "../../plugin/index.js";
import type { CheckStatus, CheckSummary } from "../doctor-checks/index.js";

/** What `doctor --all` hands every deep check. */
export interface DeepCheckInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	loader?: PluginLoader;
	print?: (line: string) => void;
	logger?: Logger;
}

/** How a deep check ended, for `doctor --all` to total up. */
export interface DeepCheckOutcome {
	status: CheckStatus;
	summary: CheckSummary;
	/** Why it was skipped, or the one line that says it could not run. */
	reason?: string;
}

/** One `doctor <name>` deep check. */
export interface DeepCheck {
	/** The subcommand: `doctor <name>`. */
	name: string;
	/** The capability whose declared state it compares with the real one. */
	capability: CapabilityKey;
	/** How `doctor` registers the subcommand. */
	command: CommandModule<never, never>;
	/** How `doctor --all` runs it. */
	run(input: DeepCheckInput): Promise<DeepCheckOutcome>;
}
