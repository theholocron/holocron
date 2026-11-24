import { describe, expect, it } from "vitest";

import type { Notifications } from "../../plugin/index.js";
import { incidentMirrorNote } from "./incident-mirror-note.js";

const layout = (...feeds: unknown[]) =>
	({
		layout: {
			categories: [{ name: "c", channels: feeds.map((f, i) => ({ name: `ch${i}`, feeds: { incidents: f } })) }],
		},
	}) as unknown as Notifications;

describe("incidentMirrorNote", () => {
	it("has no note when the page is the one a forum follows", () => {
		expect(incidentMirrorNote([layout("The Holocron")], "The Holocron", 2)).toBeUndefined();
		expect(incidentMirrorNote([layout(true)], "Only", 1)).toBeUndefined();
	});

	it("says so when no forum follows incidents", () => {
		expect(incidentMirrorNote([layout(undefined, false)], "P", 1)).toMatch(/no forum has `feeds.incidents`/);
		expect(incidentMirrorNote([{} as Notifications], "P", 1)).toMatch(/no forum has/);
	});

	it("says so when the forum follows another page, or `true` with several pages declared", () => {
		expect(incidentMirrorNote([layout("The Holocron")], "Other", 2)).toMatch(/follows "The Holocron"/);
		expect(incidentMirrorNote([layout(true)], "P", 2)).toMatch(/follows one page only/);
	});
});
