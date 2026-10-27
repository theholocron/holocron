import { PluginLoader, type PluginProbes } from "../../plugin/index.js";
import { statusRow } from "../../ui/status-row/index.js";
import { CORE_PROVIDER, coreProbes } from "./core-probes.js";
import { listProbes } from "./list-probes.js";
import type { ProbeCommandReport, RunProbeCommandInput } from "./probe.type.js";
import { runProbe } from "./run-probe.js";

/**
 * `holocron probe [<provider> [<probe>]]`. With nothing, lists what can be probed; with a provider, lists its probes;
 * with both, runs one. Probes come from the configured plugins, plus the CLI's own `core` group.
 */
export async function runProbeCommand(input: RunProbeCommandInput): Promise<ProbeCommandReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	/* v8 ignore next -- the real loader is only built outside tests, which always inject one */
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();

	const groups = new Map<string, PluginProbes>(loader.probes());
	groups.set(CORE_PROVIDER, coreProbes(loader));

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

	const tokens = [input.context.cliToken, ...Object.values(input.context.cliTokens ?? {})].filter(
		(t): t is string => typeof t === "string"
	);
	const report = await runProbe({
		name: `${input.provider} ${input.probe}`,
		provider: input.provider,
		probeName: input.probe,
		probe,
		dryRun: input.dryRun ?? false,
		yes: input.yes ?? false,
		secrets: tokens,
		print,
		...(input.interactive !== undefined ? { interactive: input.interactive } : {}),
		...(input.confirm ? { confirm: input.confirm } : {}),
		...(input.onInterrupt ? { onInterrupt: input.onInterrupt } : {}),
	});
	return { status: report.status };
}
