import type { MonitoringIncidentImpact, MonitoringIncidentInput } from "../../plugin/index.js";

/** The impact words a person may write, mildest first. */
export const INCIDENT_IMPACTS: readonly MonitoringIncidentImpact[] = ["maintenance", "degraded", "partial", "major"];

/**
 * Reads `--component <name>=<impact>` values (and a workflow's one-per-line or comma-separated input) into the impacts
 * an incident marks. A component is checked against `known`, the names the status page declares, and an impact against
 * {@link INCIDENT_IMPACTS}; every problem is returned at once so nothing is written for a half-right request.
 */
export function parseIncidentImpacts(
	values: readonly string[],
	known: readonly string[]
): { impacts: MonitoringIncidentInput["impacts"]; problems: string[] } {
	const impacts: MonitoringIncidentInput["impacts"] = [];
	const problems: string[] = [];
	const entries = values.flatMap((v) => v.split(/[\n,]/)).map((v) => v.trim());
	for (const entry of entries.filter((e) => e !== "")) {
		const at = entry.lastIndexOf("=");
		const component = at < 0 ? "" : entry.slice(0, at).trim();
		const impact = at < 0 ? "" : entry.slice(at + 1).trim();
		if (component === "" || impact === "") {
			problems.push(`"${entry}" is not <component>=<impact>`);
			continue;
		}
		if (!known.includes(component)) {
			problems.push(`no component "${component}" (the page has ${known.join(", ") || "none"})`);
			continue;
		}
		if (!(INCIDENT_IMPACTS as readonly string[]).includes(impact)) {
			problems.push(`impact "${impact}" of "${component}" is not one of ${INCIDENT_IMPACTS.join(", ")}`);
			continue;
		}
		if (impacts.some((i) => i.component === component)) {
			problems.push(`"${component}" is given twice`);
			continue;
		}
		impacts.push({ component, impact: impact as MonitoringIncidentImpact });
	}
	return { impacts, problems };
}
