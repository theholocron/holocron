import type { PluginProbes } from "../../plugin/index.js";
import type { CommandEntry } from "../command-registry/index.js";

/**
 * One menu entry per probe, grouped under its provider (`probe sentry integrations`), for the menu `holocron probe`
 * opens on a terminal. Built from the loaded plugins, so the menu always shows exactly the probes that exist. A probe
 * that changes things offers a dry-run preview first; one that only reads has nothing to preview.
 */
export function buildProbeMenuEntries(groups: ReadonlyMap<string, PluginProbes>): CommandEntry[] {
	const entries: CommandEntry[] = [];
	for (const [provider, probes] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
		for (const [name, probe] of Object.entries(probes).sort(([a], [b]) => a.localeCompare(b))) {
			entries.push({
				name: `probe ${provider} ${name}`,
				description: probe.writes ? `${probe.summary} (changes things)` : probe.summary,
				positionals: [],
				supportsDryRun: probe.writes,
				spawnArgs: ["probe", provider, name],
			});
		}
	}
	return entries;
}
