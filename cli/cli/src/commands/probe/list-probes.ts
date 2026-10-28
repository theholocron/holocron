import type { PluginProbes } from "../../plugin/index.js";
import { style } from "../../ui/style/index.js";

/** The listing `holocron probe` prints: each provider, and under it each probe with its summary; writers are marked. */
export function listProbes(groups: ReadonlyMap<string, PluginProbes>): string[] {
	const lines: string[] = [];
	const width = Math.max(0, ...[...groups.values()].flatMap((g) => Object.keys(g).map((n) => n.length)));
	for (const [provider, probes] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
		lines.push(style.header(provider));
		for (const [name, probe] of Object.entries(probes).sort(([a], [b]) => a.localeCompare(b))) {
			const mark = probe.writes ? "  (changes things)" : "";
			lines.push(`  ${name.padEnd(width)}  ${probe.summary}${mark}`);
		}
		lines.push("");
	}
	return lines;
}
