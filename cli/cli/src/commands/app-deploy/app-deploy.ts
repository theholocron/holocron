import { join } from "node:path";

import { style } from "@theholocron/kyber/ui";
import { errorMessage } from "@theholocron/misc-utils";

import { checkProjectDomain } from "../app-domain-check/index.js";
import type { AppTarget } from "../app-env/index.js";
import { type AppInstance, appInstance } from "../app-instance/index.js";
import { appPlan } from "../app-plan/index.js";
import type { AppDeployReport, RunAppDeployInput } from "./app-deploy.type.js";

/**
 * `holocron deploy <app> --env <env>`: builds the app, stages it and deploys the staged files, once for each environment
 * `--env` names (production, then preview). Production goes to the project that takes the app folder's name; preview goes
 * to the instance the app declares (`appInstance()`: a project of its own, its crons left out), or to a preview deployment
 * of the same project when it declares none. Before anything is written every project must serve its configured `domain`. An app with no `deployment` provider has nothing to deploy and is
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
	let instances: { target: AppTarget; instance: AppInstance }[];
	try {
		instances = env.targets.map((target) => ({
			target,
			instance: appInstance(app.name, plan.deployment!.options, target),
		}));
	} catch (err) {
		return fail(errorMessage(err));
	}
	// Every project must serve its domain before anything is written.
	for (const { instance } of instances) {
		const checked = await checkProjectDomain(loader.get("deployment"), instance.project, instance.domain);
		if (checked.status === "fail") return fail(checked.message);
		print(`  ${style.dim(checked.message)}`);
	}

	if (dryRun) {
		const where = instances.map(({ target, instance }) => `${instance.project} (${target})`).join(" + ");
		const message = `would: build and stage ${app.path}, then deploy it to ${where}`;
		print(`  ${style.dim(`… ${message}`)}`);
		return { status: "dry-run", message };
	}

	const built = input.build(app.dir);
	if (built.status === "fail") return fail(built.message);

	// A preview instance is staged on its own, without the crons, so the two payloads never overwrite each other.
	const staged = new Map<boolean, string>();
	for (const { target, instance } of instances) {
		let dir = staged.get(instance.omitCrons);
		if (!dir) {
			const result = input.stage({
				packageDir: app.dir,
				print,
				...(instance.omitCrons ? { omitCrons: true, outDir: join(app.dir, ".vercel-deploy-preview") } : {}),
			});
			if (result.status === "fail" || !result.outDir) {
				return fail(`stage: ${result.message ?? "no payload was made"}`);
			}
			dir = result.outDir;
			staged.set(instance.omitCrons, dir);
		}
		const report = await input.deployFiles({
			loaded,
			context,
			projectId: instance.project,
			dir,
			...(instance.production ? { target: "production" as const } : {}),
			loader,
			print,
		});
		if (report.status === "fail") return fail(`${target}: ${report.message ?? "the deployment failed"}`);
	}
	return { status: "ok", message: `${app.name} deployed to ${env.targets.join(" + ")}` };
}
