import { style } from "@theholocron/kyber/ui";

import { checkProjectDomain } from "../app-domain-check/index.js";
import { appPlan } from "../app-plan/index.js";
import type { AppDeployReport, RunAppDeployInput } from "./app-deploy.type.js";

/**
 * `holocron deploy <app> --env <env>`: builds the app, stages it and deploys the staged files to the project that takes
 * the app folder's name, once for each environment `--env` names (production, then preview). Before anything is written the
 * project must serve the app's configured `domain`. An app with no `deployment` provider has nothing to deploy and is
 * reported, not failed (Comlink's Worker is made by `setup notifications`; Council is installed by hand).
 *
 * @param input - The app, the environment, its loaded config and the seams tests replace.
 */
export async function runAppDeploy(input: RunAppDeployInput): Promise<AppDeployReport> {
	const { app, env } = input;
	const print = input.print ?? ((line: string) => console.log(line));
	const fail = (message: string): AppDeployReport => {
		print(`  ${style.fail(message)}`);
		return { status: "fail", message };
	};
	if (app.configError) return fail(`${app.name}: its holocron.config cannot be read: ${app.configError}`);

	const plan = appPlan(app.config);
	if (!plan.deployment) {
		const message = plan.workers
			? `${app.name}: its Worker is deployed by \`holocron setup notifications\`, which has the channel webhooks it needs; nothing to do here`
			: `${app.name}: no deployment is configured; nothing to do`;
		print(`  ${style.dim(message)}`);
		return { status: "nothing", message };
	}

	const { loaded, context, loader } = await input.load();
	const dryRun = Boolean(context.dryRun);
	print(style.header(`Holocron deploy ${app.name} → ${env.targets.join(" + ")}${dryRun ? " (dry-run)" : ""}`));

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

	if (dryRun) {
		const message = `would: build and stage ${app.path}, then deploy it to ${app.name} (${env.targets.join(" + ")})`;
		print(`  ${style.dim(`… ${message}`)}`);
		return { status: "dry-run", message };
	}

	const built = input.build(app.dir);
	if (built.status === "fail") return fail(built.message);
	const staged = input.stage({ packageDir: app.dir, print });
	if (staged.status === "fail" || !staged.outDir) return fail(`stage: ${staged.message ?? "no payload was made"}`);

	for (const target of env.targets) {
		const report = await input.deployFiles({
			loaded,
			context,
			projectId: app.name,
			dir: staged.outDir,
			...(target === "production" ? { target: "production" as const } : {}),
			loader,
			print,
		});
		if (report.status === "fail") return fail(`${target}: ${report.message ?? "the deployment failed"}`);
	}
	return { status: "ok", message: `${app.name} deployed to ${env.targets.join(" + ")}` };
}
