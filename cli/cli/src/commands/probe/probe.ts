import { join } from "node:path";

import { commandFailureMessage, statusRow, style } from "@theholocron/kyber/ui";

import { isEnvironmentLayer } from "../../credentials-environments/index.js";
import { PluginLoader, type PluginProbes } from "../../plugin/index.js";
import { ownerEnvironments } from "../owner-environments/index.js";
import { tokenExpectations } from "../token-expectations/index.js";
import { loadAppVault } from "./app-vault.js";
import { COMLINK_PROVIDER, comlinkProbes } from "./comlink-probes.js";
import { CORE_PROVIDER, coreProbes } from "./core-probes.js";
import { DEPS_PROVIDER, depsProbes } from "./deps/index.js";
import { DOCS_PROVIDER, docsCoverageProbes } from "./docs-coverage/index.js";
import { GENERATED_PROVIDER, generatedProbes } from "./generated/index.js";
import { listProbes } from "./list-probes.js";
import type { ProbeCommandReport, ProbeStep, RunProbeCommandInput } from "./probe.type.js";
import { defaultProviderTokens, environmentTokens } from "./probe-token/index.js";
import { CI_PROVIDER, ciProbes } from "./references/index.js";
import { runProbe } from "./run-probe.js";
import { realSpecsIo, SPECS_PROVIDER, specsProbes } from "./specs/index.js";
import { realTasksIo, TASKS_PROVIDER, tasksProbes } from "./tasks/index.js";

/**
 * `holocron probe [<provider> [<probe>]]`. With nothing, lists what can be probed; with a provider, lists its probes;
 * with both, runs one. Probes come from the configured plugins, plus the CLI's own `core` group.
 */
export async function runProbeCommand(input: RunProbeCommandInput): Promise<ProbeCommandReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	/* v8 ignore next -- the real loader is only built outside tests, which always inject one */
	const makeLoader = input.makeLoader ?? ((context) => new PluginLoader(input.loaded.resolved, context));
	const loader = input.loader ?? makeLoader(input.context);
	await loader.load();

	const groups = new Map<string, PluginProbes>(loader.probes());
	const comlink = comlinkProbes({
		loader,
		appVault: (appDir) => loadAppVault(join(input.context.repoRoot, appDir), input.context),
	});
	groups.set(CORE_PROVIDER, coreProbes(loader, new Map([[COMLINK_PROVIDER, comlink]])));
	groups.set(COMLINK_PROVIDER, comlink);
	groups.set(
		DOCS_PROVIDER,
		docsCoverageProbes(
			input.context.repoRoot,
			input.typedoc,
			undefined,
			input.loaded.resolved.repoValidation?.docsCoverage ?? "off"
		)
	);

	groups.set(DEPS_PROVIDER, depsProbes(input.context.repoRoot, print));
	groups.set(GENERATED_PROVIDER, generatedProbes(input.loaded, input.context.repoRoot));
	groups.set(CI_PROVIDER, ciProbes(input.context.org));
	groups.set(SPECS_PROVIDER, specsProbes(realSpecsIo(input.context.repoRoot)));
	groups.set(TASKS_PROVIDER, tasksProbes(realTasksIo(input.context.repoRoot)));

	if (!input.provider) {
		if (input.pick) await input.pick(groups);
		else for (const line of listProbes(groups)) print(line);
		return { status: "listed" };
	}
	const probes = groups.get(input.provider);
	if (!probes) {
		print(
			statusRow("fail", [`no probes for \`${input.provider}\``, `try: ${[...groups.keys()].sort().join(", ")}`])
		);
		return { status: "fail" };
	}
	if (!input.probe) {
		for (const line of listProbes(new Map([[input.provider, probes]]))) print(line);
		return { status: "listed" };
	}
	const probe = probes[input.probe];
	if (!probe) {
		print(
			statusRow("fail", [
				`\`${input.provider}\` has no probe \`${input.probe}\``,
				`try: ${Object.keys(probes).sort().join(", ")}`,
			])
		);
		return { status: "fail" };
	}

	// A token read from a layer's Environment is checked against what that layer should carry; any other token is only described.
	// Every token the plugin declares that the Environment holds is its own step, so no feature word has to pick one.
	let layer: string | undefined;
	const steps: ProbeStep[] = [{ context: input.context, args: [] }];
	const notHeld: Array<{ name: string; fails: boolean; environment: string }> = [];
	if (probe.acceptsToken) {
		const given = input.context.cliTokens?.[input.provider] ?? input.context.cliToken;
		const chosen = input.environment
			? { environment: input.environment }
			: given === undefined
				? await input.chooseToken?.(input.provider)
				: undefined;
		try {
			if (chosen?.environment) {
				/* v8 ignore next -- the real importer reads installed plugin packages, which tests replace with `providerTokens` */
				const declared = await (input.providerTokens ?? defaultProviderTokens(input.loaded))(input.provider);
				const found = await environmentTokens({
					provider: input.provider,
					environment: chosen.environment,
					repoRoot: input.context.repoRoot,
					configured: ownerEnvironments(input.loaded.resolved).names,
					vault: loader.has("vault") ? loader.get("vault") : undefined,
					tokens: declared,
				});
				if (isEnvironmentLayer(chosen.environment)) layer = chosen.environment;
				steps.length = 0;
				for (const held of found.held) {
					steps.push({
						context: {
							...input.context,
							cliTokens: { ...input.context.cliTokens, [input.provider]: held.token },
						},
						heading: held.envName,
						args: ["--token-name", held.envName],
					});
				}
				for (const name of found.missing) {
					notHeld.push({
						name,
						// A layer that declares the token holds it, so a missing one is a failure there.
						fails: layer !== undefined && tokenExpectations(declared, { layer, envName: name }).length > 0,
						environment: found.environment,
					});
				}
			} else if (chosen?.token) {
				steps[0] = {
					context: {
						...input.context,
						cliTokens: { ...input.context.cliTokens, [input.provider]: chosen.token },
					},
					args: [],
				};
			}
		} catch (err) {
			print(statusRow("fail", [`\`${input.provider} ${input.probe}\``, commandFailureMessage(err)]));
			return { status: "fail" };
		}
	}

	const out = input.print ?? (probe.reportsTo === "stderr" ? (line: string) => console.error(line) : print);
	const statuses: Array<ProbeCommandReport["status"]> = [];
	for (const step of steps) {
		let stepProbe = probe;
		if (step.context !== input.context) {
			const reloaded = makeLoader(step.context);
			await reloaded.load();
			stepProbe = reloaded.probes().get(input.provider)?.[input.probe] ?? probe;
		}
		const tokens = [step.context.cliToken, ...Object.values(step.context.cliTokens ?? {})].filter(
			(t): t is string => typeof t === "string"
		);
		const report = await runProbe({
			name: `${input.provider} ${input.probe}`,
			provider: input.provider,
			probeName: input.probe,
			args: [...(input.args ?? []), ...(layer ? ["--layer", layer] : []), ...step.args],
			...(step.heading ? { heading: step.heading } : {}),
			...(input.lcov ? { lcov: input.lcov } : {}),
			probe: stepProbe,
			dryRun: input.dryRun ?? false,
			yes: input.yes ?? false,
			secrets: tokens,
			print: out,
			...(input.interactive !== undefined ? { interactive: input.interactive } : {}),
			...(input.confirm ? { confirm: input.confirm } : {}),
			...(input.onInterrupt ? { onInterrupt: input.onInterrupt } : {}),
		});
		statuses.push(report.status);
	}
	for (const missing of notHeld) {
		out(`\n  ${style.header(missing.name)}`);
		out(statusRow(missing.fails ? "fail" : "skip", [`not held in ${missing.environment}`]));
		if (missing.fails) statuses.push("fail");
	}
	return { status: (["fail", "cancelled"] as const).find((s) => statuses.includes(s)) ?? "ok" };
}
