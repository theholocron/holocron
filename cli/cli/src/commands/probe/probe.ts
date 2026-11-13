import { join } from "node:path";

import { commandFailureMessage, statusRow } from "@theholocron/kyber/ui";

import { isEnvironmentLayer } from "../../credentials-environments/index.js";
import { PluginLoader, type PluginProbes } from "../../plugin/index.js";
import { ownerEnvironments } from "../doctor-variable-owners/index.js";
import { loadAppVault } from "./app-vault.js";
import { COMLINK_PROVIDER, comlinkProbes } from "./comlink-probes.js";
import { CORE_PROVIDER, coreProbes } from "./core-probes.js";
import { DEPS_PROVIDER, depsProbes } from "./deps/index.js";
import { DOCS_PROVIDER, docsCoverageProbes } from "./docs-coverage/index.js";
import { GENERATED_PROVIDER, generatedProbes } from "./generated/index.js";
import { listProbes } from "./list-probes.js";
import type { ProbeCommandReport, RunProbeCommandInput } from "./probe.type.js";
import { defaultProviderTokens, environmentToken } from "./probe-token/index.js";
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
	let probe = probes[input.probe];
	if (!probe) {
		print(
			statusRow("fail", [
				`\`${input.provider}\` has no probe \`${input.probe}\``,
				`try: ${Object.keys(probes).sort().join(", ")}`,
			])
		);
		return { status: "fail" };
	}

	let context = input.context;
	// A token read from a layer's Environment is checked against what that layer should carry; any other token is only described.
	let layer: string | undefined;
	if (probe.acceptsToken) {
		const given = context.cliTokens?.[input.provider] ?? context.cliToken;
		const chosen = input.environment
			? { environment: input.environment }
			: given === undefined
				? await input.chooseToken?.(input.provider)
				: undefined;
		let override: string | undefined;
		try {
			if (chosen?.environment) {
				const found = await environmentToken({
					provider: input.provider,
					environment: chosen.environment,
					repoRoot: context.repoRoot,
					configured: ownerEnvironments(input.loaded.resolved).names,
					vault: loader.has("vault") ? loader.get("vault") : undefined,
					/* v8 ignore next -- the real importer reads installed plugin packages, which tests replace with `providerTokens` */
					tokens: await (input.providerTokens ?? defaultProviderTokens(input.loaded))(input.provider),
				});
				override = found.token;
				if (isEnvironmentLayer(chosen.environment)) layer = chosen.environment;
				print(statusRow("skip", ["token", `read ${found.variable} from ${found.environment}`]));
			} else if (chosen?.token) {
				override = chosen.token;
			}
		} catch (err) {
			print(statusRow("fail", [`\`${input.provider} ${input.probe}\``, commandFailureMessage(err)]));
			return { status: "fail" };
		}
		if (override !== undefined) {
			context = { ...context, cliTokens: { ...context.cliTokens, [input.provider]: override } };
			const reloaded = makeLoader(context);
			await reloaded.load();
			probe = reloaded.probes().get(input.provider)?.[input.probe] ?? probe;
		}
	}

	const tokens = [context.cliToken, ...Object.values(context.cliTokens ?? {})].filter(
		(t): t is string => typeof t === "string"
	);
	const report = await runProbe({
		name: `${input.provider} ${input.probe}`,
		provider: input.provider,
		probeName: input.probe,
		args: [...(input.args ?? []), ...(layer ? ["--layer", layer] : [])],
		...(input.lcov ? { lcov: input.lcov } : {}),
		probe,
		dryRun: input.dryRun ?? false,
		yes: input.yes ?? false,
		secrets: tokens,
		print: input.print ?? (probe.reportsTo === "stderr" ? (line: string) => console.error(line) : print),
		...(input.interactive !== undefined ? { interactive: input.interactive } : {}),
		...(input.confirm ? { confirm: input.confirm } : {}),
		...(input.onInterrupt ? { onInterrupt: input.onInterrupt } : {}),
	});
	return { status: report.status };
}
