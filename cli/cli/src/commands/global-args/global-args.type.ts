import type { GlobalArgs as ToolGlobalArgs } from "@theholocron/kyber/flags";
import type { LogLevel } from "@theholocron/observability/core";

/**
 * The options every command accepts, declared once on the root in `cli.ts`: kyber's `--dry-run`, `--token` and `--cwd`
 * plus holocron's own. A command module's arguments extend this.
 */
export interface GlobalArgs extends ToolGlobalArgs {
	/** `--skip-dry-run`: in the menu, run a dry-run-capable command for real without the preview first. */
	skipDryRun: boolean;
	/** `--org`: the active org, ahead of `HOLOCRON_ORG` and the config's `org`. */
	org?: string;
	/** `--verbose`: log at debug level. */
	verbose: boolean;
	/** `--debug`: print the run ID at the end of the command. */
	debug: boolean;
	/** `--quiet`: log at error level. */
	quiet: boolean;
	/** `--log`: show structured logger output at this level. */
	log?: LogLevel;
}
