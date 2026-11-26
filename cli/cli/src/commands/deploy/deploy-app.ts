import { errorMessage } from "@theholocron/misc-utils";

import { loadConfig } from "../../config/index.js";
import { reportError } from "../../observability/logger/index.js";
import { PluginLoader } from "../../plugin/index.js";
import { runAppDeploy } from "../app-deploy/index.js";
import { parseAppEnv } from "../app-env/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import { buildApp } from "../build-app/index.js";
import { stageDeploy } from "../deploy-stage/deploy-stage.js";
import type { GlobalArgs } from "../global-args/index.js";
import { resolveApp } from "../resolve-app/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import type { DeployArgs } from "./deploy.args.js";
import { runDeployFromFiles } from "./deploy.js";

/**
 * The `deploy <app> --env <env>` path of the `deploy` command (spec `tool-app-deploy-sync`). Returns `false` when the
 * arguments do not name an app (no `--env`, and the value is not an app's name), so the command goes on to deploy a
 * branch as it always has; `true` once it has handled the run, setting a failing exit code on an error.
 *
 * @param argv - The parsed arguments of `holocron deploy`.
 */
export async function deployApp(argv: GlobalArgs & DeployArgs): Promise<boolean> {
	const lookup = await resolveApp(argv.branch, argv.cwd);
	const { app } = lookup;
	if (!app && argv.env === undefined) return false;
	const fail = (message: string) => {
		reportError(`deploy: ${message}`);
		process.exitCode = 1;
		return true;
	};
	if (!app) {
		const names = lookup.names.length ? lookup.names.join(", ") : "none found";
		return fail(
			argv.branch
				? `no app named "${argv.branch}" in this workspace (apps: ${names})`
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
	const report = await runAppDeploy({
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
		build: buildApp,
		stage: stageDeploy,
		deployFiles: runDeployFromFiles,
	});
	if (report.status === "fail") process.exitCode = 1;
	return true;
}
