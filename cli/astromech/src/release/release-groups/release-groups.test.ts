import { describe, expect, it } from "vitest";

import { releaseGroups } from "./release-groups.js";

const publish = (withInputs: Record<string, unknown>) => ({ tasks: [{ name: "delivery.publish", with: withInputs }] });

describe("releaseGroups", () => {
	it("lists the folder names, whether a group is written as a name or as an object", () => {
		expect(
			releaseGroups(publish({ groups: ["utils", { name: "cli", "sentry-project": "x" }, "observability"] }))
		).toEqual(["utils", "cli", "observability"]);
	});

	it("is empty for a repo that releases as one", () => {
		expect(releaseGroups(publish({ "sentry-project": "x" }))).toEqual([]);
		expect(releaseGroups({ tasks: [{ name: "delivery.publish" }] })).toEqual([]);
		expect(releaseGroups({ tasks: ["delivery.publish"] })).toEqual([]);
		expect(releaseGroups({ tasks: ["verification.unitTests"] })).toEqual([]);
		expect(releaseGroups({})).toEqual([]);
	});

	it("ignores `groups` on another task", () => {
		expect(releaseGroups({ tasks: [{ name: "verification.unitTests", with: { groups: ["a"] } }] })).toEqual([]);
	});

	it("skips entries it cannot read a name from, and a `groups` that is not a list", () => {
		expect(releaseGroups(publish({ groups: ["a", 3, null, {}, { name: 4 }, { name: "b" }] }))).toEqual(["a", "b"]);
		expect(releaseGroups(publish({ groups: "utils" }))).toEqual([]);
	});
});
