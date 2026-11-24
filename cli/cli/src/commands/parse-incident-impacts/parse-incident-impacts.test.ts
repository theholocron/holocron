import { describe, expect, it } from "vitest";

import { INCIDENT_IMPACTS, parseIncidentImpacts } from "./parse-incident-impacts.js";

const known = ["Sentinel", "Docs"];

describe("parseIncidentImpacts", () => {
	it("reads repeated values, and one-per-line and comma-separated ones", () => {
		const { impacts, problems } = parseIncidentImpacts(["Sentinel=major", "Docs=degraded\n"], known);
		expect(problems).toEqual([]);
		expect(impacts).toEqual([
			{ component: "Sentinel", impact: "major" },
			{ component: "Docs", impact: "degraded" },
		]);
		expect(parseIncidentImpacts(["Sentinel=partial, Docs=maintenance"], known).impacts).toHaveLength(2);
	});

	it("reads nothing as no impacts and skips blank lines", () => {
		expect(parseIncidentImpacts([], known)).toEqual({ impacts: [], problems: [] });
		expect(parseIncidentImpacts(["\n\n"], known)).toEqual({ impacts: [], problems: [] });
	});

	it("reports every problem at once", () => {
		const { impacts, problems } = parseIncidentImpacts(
			["Sentinel", "=major", "Sentinel=", "Nope=major", "Docs=huge", "Docs=major", "Docs=partial"],
			known
		);
		expect(impacts).toEqual([{ component: "Docs", impact: "major" }]);
		expect(problems).toEqual([
			'"Sentinel" is not <component>=<impact>',
			'"=major" is not <component>=<impact>',
			'"Sentinel=" is not <component>=<impact>',
			'no component "Nope" (the page has Sentinel, Docs)',
			`impact "huge" of "Docs" is not one of ${INCIDENT_IMPACTS.join(", ")}`,
			'"Docs" is given twice',
		]);
	});

	it("says a page with no components has none", () => {
		expect(parseIncidentImpacts(["A=major"], []).problems).toEqual(['no component "A" (the page has none)']);
	});
});
