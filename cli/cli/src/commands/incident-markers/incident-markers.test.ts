import { describe, expect, it } from "vitest";

import { incidentKey, incidentMarker, postedUpdateIds, updateMarker } from "./incident-markers.js";

describe("incident markers", () => {
	it("keys a post by status page and incident", () => {
		expect(incidentKey("The Holocron", "i1")).toBe("The Holocron#i1");
	});

	it("writes the footer lines", () => {
		expect(incidentMarker("i1")).toBe("-# incident: i1");
		expect(updateMarker("u1")).toBe("-# update: u1");
	});

	it("reads back the ids of posted updates from any message, ignoring the incident line and prose", () => {
		const messages = [
			"**RESOLVED** done\n-# update: u2",
			"summary\n-# incident: i1\n-# sync: key | open",
			"said -# update: not-a-line\n-# update: u1  ",
		];
		expect([...postedUpdateIds(messages)].sort()).toEqual(["u1", "u2"]);
		expect(postedUpdateIds([]).size).toBe(0);
	});
});
