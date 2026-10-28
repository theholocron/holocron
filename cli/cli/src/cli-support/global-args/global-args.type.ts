import type { LogLevel } from "@theholocron/observability/core";

/** The options every command accepts: declared once, on the root, in `cli.ts`. A command module's arguments extend this. */
export interface GlobalArgs {
	dryRun: boolean;
	skipDryRun: boolean;
	token?: string[];
	org?: string;
	cwd: string;
	verbose: boolean;
	debug: boolean;
	quiet: boolean;
	log?: LogLevel;
}
