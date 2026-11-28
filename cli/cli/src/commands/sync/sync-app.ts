import { errorMessage } from "@theholocron/misc-utils";

import { loadConfig } from "../../config/index.js";
import { reportError } from "../../observability/logger/index.js";
import { PluginLoader } from "../../plugin/index.js";
import { parseAppEnv } from "../app-env/index.js";
import { runAppSync } from "../app-sync/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import type { GlobalArgs } from "../global-args/index.js";
import { resolveApp } from "../resolve-app/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { resolveEnvironmentId, runSecretsSync } from "../secrets-sync/index.js";
import { tokenContext } from "../token-context/index.js";
import type { SyncArgs } from "./sync.args.js";
import { SYNC_STEPS } from "./sync.js";

/**
 * The `sync <app> --env <env>` path of the `sync` command (spec `tool-app-deploy-sync`). The first step is the app's
 * name unless it is one of the sync steps. Returns `false` when the arguments do not name an app (no `--env`, and the
 * value is no app's name), so the command goes on to run its steps as it always has; `true` once it has handled the
 * run, setting a failing exit code on an error.
 *
 * @param argv - The parsed arguments of `holocron sync`.
 */
export async function syncApp(argv: GlobalArgs & SyncArgs): Promise<boolean> {
	const first = argv.steps?.[0];
	const name = first !== undefined && !(SYNC_STEPS as ReadonlyArray<string>).includes(first) ? first : undefined;
	const lookup = await resolveApp(name, argv.cwd);
	const { app } = lookup;
	if (!app && argv.env === undefined) return false;
	const fail = (message: string) => {
		reportError(`sync: ${message}`);
		process.exitCode = 1;
		return true;
	};
	if (!app) {
		const names = lookup.names.length ? lookup.names.join(", ") : "none found";
		return fail(
			name
				? `no app named "${name}" in this workspace (apps: ${names})`
				: `name an app, or run it from inside one (apps: ${names})`
		);
	}
	let env;
	try {
		env = parseAppEnv(argv.env);
	} catch (err) {
		return fail(errorMessage(err));
	}
	const tokens = tokenContext(argv.token);
	if (!tokens) return true;
	const report = await runAppSync({
		app,
		env,
		load: async () => {
			const loaded = await loadConfig(app.dir);
			applyResolvedConfig(argv, loaded.resolved);
			const context = {
				repoRoot: app.dir,
				dryRun: argv.dryRun,
				...tokens,
				org: resolveOrg(argv, loaded.resolved),
			};
			return { loaded, context, loader: new PluginLoader(loaded.resolved, context) };
		},
		resolveEnvironment: (layer) => resolveEnvironmentId(layer, { repoRoot: app.dir }),
		syncSecrets: runSecretsSync,
	});
	if (report.status === "fail") process.exitCode = 1;
	return true;
}
