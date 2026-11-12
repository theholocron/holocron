import type { CheckRow } from "@theholocron/kyber/ui";

import type { CallerHome, ParsedCaller } from "./doctor-ci.type.js";
import { homeOf } from "./home-of.js";

const SAYS: Record<CallerHome, string> = {
	legacy: "theholocron/.github (frozen copies, legacy names)",
	"ci-v1": "theholocron/holocron at ci-v1 (flat names)",
	local: "this repo's own reusables (flat names)",
	other: "somewhere else",
};

/**
 * The `home` row: where the callers point. All at `theholocron/.github` is the frozen, legacy-named home; all at holocron
 * `ci-v1` (or at this repo's own reusables, in the repo that hosts them) is the flat one. Callers split between homes
 * fail, since the names and the checks they post then follow two vocabularies. `gateShut` says the generator still
 * writes the legacy names for a repo that does not host the reusables (`legacyGate()`), and is only worded into the detail.
 */
export function homeRow(callers: readonly ParsedCaller[], gateShut: boolean): CheckRow {
	const id = "home";
	const title = "callers point at one home";
	const homes = new Map<CallerHome, string[]>();
	for (const caller of callers) {
		for (const job of caller.jobs) {
			const home = homeOf(job.uses);
			homes.set(home, [...(homes.get(home) ?? []), caller.file]);
		}
	}
	if (homes.size === 0) return { id, title, status: "skip", detail: "no generated callers", problems: [] };
	if (homes.size > 1) {
		const problems = [...homes].map(([home, files]) => `${SAYS[home]}: ${[...new Set(files)].join(", ")}`);
		return { id, title, status: "fail", detail: `${homes.size} homes`, problems };
	}
	const [home] = [...homes.keys()] as [CallerHome];
	const gate =
		home === "legacy" ? (gateShut ? "; sync still writes these names" : "; sync now writes flat names") : "";
	return { id, title, status: "ok", detail: `${SAYS[home]}${gate}`, problems: [] };
}
