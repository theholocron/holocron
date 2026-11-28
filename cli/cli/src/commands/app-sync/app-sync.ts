import { style } from "@theholocron/kyber/ui";

import { checkProjectDomain } from "../app-domain-check/index.js";
import { appPlan } from "../app-plan/index.js";
import { deployFilter, secretRoutes, variableRoutes } from "../secrets-sync/index.js";
import type { AppSyncReport, RunAppSyncInput } from "./app-sync.type.js";

/**
 * `holocron sync <app> --env <env>`: reads the app's vault Environment of the `prod` layer and sends the secrets
 * `repo.secrets.deploy` names to the app's destinations, the way `sync secrets --project-id <app> --target production`
 * or `--worker <app>` would: the Vercel project when the app has a `deployment` provider, the Worker script when it has
 * a `workers` provider, both named after the app folder. Before anything is written the project must serve the app's
 * configured `domain`. An app with neither destination has nothing to sync and is reported, not failed.
 *
 * @param input - The app, the environment, its loaded config and the seams tests replace.
 */
export async function runAppSync(input: RunAppSyncInput): Promise<AppSyncReport> {
	const { app, env } = input;
	const print = input.print ?? ((line: string) => console.log(line));
	const fail = (message: string): AppSyncReport => {
		print(`  ${style.fail(message)}`);
		return { status: "fail", message };
	};
	if (app.configError) return fail(`${app.name}: its holocron.config cannot be read: ${app.configError}`);

	const plan = appPlan(app.config);
	if (!plan.deployment && !plan.workers) {
		const message = `${app.name}: no deployment or Worker is configured, so there are no secrets to sync; nothing to do`;
		print(`  ${style.dim(message)}`);
		return { status: "nothing", message };
	}
	if (!plan.deployKeys) {
		return fail(
			`${app.name}: its config has no \`repo.secrets.deploy\` entry, and a deployment or Worker receives only the secrets that names`
		);
	}

	const { loaded, context, loader } = await input.load();
	const destinations = [plan.deployment ? `${app.name} (project)` : "", plan.workers ? `${app.name} (Worker)` : ""];
	print(
		style.header(
			`Holocron sync ${app.name} → ${destinations.filter(Boolean).join(" + ")}${context.dryRun ? " (dry-run)" : ""}`
		)
	);

	if (plan.deployment) {
		await loader.load();
		if (!loader.has("deployment")) return fail(`${app.name}: the deployment provider did not load`);
		const domain = plan.deployment.options.domain;
		const checked = await checkProjectDomain(
			loader.get("deployment"),
			app.name,
			typeof domain === "string" ? domain : undefined
		);
		if (checked.status === "fail") return fail(checked.message);
		print(`  ${style.dim(checked.message)}`);
	}

	const environment = await input.resolveEnvironment(env.layer);
	const resolved = loaded.resolved;
	// The same routes `sync secrets --env <layer>` takes from the app's config: where `repo.secrets.sync` and
	// `repo.variables.sync` send keys, and an explicit empty list for an environment that holds only variables.
	const routes = secretRoutes(resolved.repo?.secrets?.sync, environment);
	const variables = variableRoutes(resolved.repo?.variables?.sync, environment);
	const variablesOnly = variables.length > 0 && routes.length === 0;
	const filter = deployFilter(resolved.repo?.secrets?.deploy, environment);
	const report = await input.syncSecrets({
		loaded,
		context,
		loader,
		environmentId: environment,
		...(plan.deployment ? { projectId: app.name, targets: env.targets } : {}),
		...(plan.workers ? { workerScript: app.name } : {}),
		...(filter ? { deployFilter: filter } : {}),
		...(routes.length ? { secretRoutes: routes } : variablesOnly ? { secretRoutes: [] } : {}),
		...(variables.length ? { variableRoutes: variables } : {}),
	});
	if (report.summary.fail > 0) {
		return { status: "fail", message: `${app.name}: ${report.summary.fail} secret(s) did not sync` };
	}
	return {
		status: "ok",
		message: `${app.name} synced (${report.summary.ok} written, ${report.summary.skip} skipped)`,
	};
}
