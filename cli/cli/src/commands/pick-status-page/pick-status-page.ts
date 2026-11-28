import type { MonitoringStatusPageInput } from "../../plugin/index.js";

/**
 * The status page an incident command works on: `--page` names one the config declares, and with one declared it is the
 * default. Returns the page, or why there is none to pick.
 */
export function pickStatusPage(
	pages: readonly MonitoringStatusPageInput[],
	name?: string
): { page: MonitoringStatusPageInput } | { problem: string } {
	if (pages.length === 0) return { problem: "no status page is declared in the monitoring provider's `statusPages`" };
	if (name !== undefined) {
		const page = pages.find((p) => p.name === name);
		return page
			? { page }
			: { problem: `no status page named "${name}" (declared: ${pages.map((p) => p.name).join(", ")})` };
	}
	if (pages.length === 1) return { page: pages[0] };
	return {
		problem: `${pages.length} status pages are declared; name one with --page (${pages.map((p) => p.name).join(", ")})`,
	};
}
