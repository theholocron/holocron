import { loadConfig } from "../../../config/index.js";
import { applyResolvedConfig } from "../../apply-resolved-config/index.js";
import type { GlobalArgs } from "../../global-args/index.js";
import { resolveOrg } from "../../resolve-org/index.js";
import { tokenContext } from "../../token-context/index.js";
import type { MigrateScope } from "../collect-records/index.js";
import { runMigrate } from "../run-migrate/index.js";

/** The flags {@link migrateOptions} declares. */
export interface MigrateArgs extends GlobalArgs {
	from: string;
	to: string;
	openOnly?: boolean;
	milestone?: string;
	template?: string;
	yes?: boolean;
}

/** What each subcommand does after yargs: load the config and tokens, build its scope from the org, run, set the exit code. */
export async function handleMigrate(argv: MigrateArgs, scope: (owner: string) => MigrateScope): Promise<void> {
	const tokens = tokenContext(argv.token);
	if (!tokens) return;
	const loaded = await loadConfig(argv.cwd);
	applyResolvedConfig(argv, loaded.resolved);
	const org = resolveOrg(argv, loaded.resolved);
	const report = await runMigrate({
		loaded,
		context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org },
		from: argv.from,
		to: argv.to,
		scope: scope(org ?? ""),
		...(argv.openOnly ? { openOnly: true } : {}),
		...(argv.milestone ? { milestone: argv.milestone } : {}),
		...(argv.template ? { template: argv.template } : {}),
		...(argv.yes ? { yes: true } : {}),
	});
	if (report.status === "fail") process.exitCode = 1;
}
