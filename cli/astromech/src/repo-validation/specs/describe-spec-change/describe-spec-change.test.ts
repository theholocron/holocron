import { describe, expect, it } from "vitest";

import type { SpecChange } from "../specs.type.js";
import { describeSpecChange } from "./describe-spec-change.js";

const spec = (status: string | undefined, title = "Channel content"): string =>
	`${status === undefined ? "" : `---\nstatus: ${status}\n---\n`}# ${title}\n`;
const PATH = ".notes/tech-discord.spec.md";
const change = (over: Partial<SpecChange>): SpecChange => ({
	event: "opened",
	path: PATH,
	before: undefined,
	after: spec("proposed"),
	...over,
});

describe("describeSpecChange", () => {
	it("announces a new spec when the pull request opens", () => {
		expect(describeSpecChange(change({}))).toEqual({
			path: PATH,
			title: "Channel content",
			kind: "new",
			status: "proposed",
		});
	});

	it("announces a spec the pull request edits, and one whose status it changes", () => {
		expect(describeSpecChange(change({ before: spec("proposed"), after: spec("proposed", "Renamed") }))).toEqual({
			path: PATH,
			title: "Renamed",
			kind: "edited",
			status: "proposed",
		});
		expect(describeSpecChange(change({ before: spec("draft"), after: spec("proposed") }))).toEqual({
			path: PATH,
			title: "Channel content",
			kind: "status",
			status: "proposed",
			previousStatus: "draft",
		});
	});

	it("says a status that appeared or went away, without inventing the other side", () => {
		expect(describeSpecChange(change({ before: spec(undefined), after: spec("draft") }))).toEqual({
			path: PATH,
			title: "Channel content",
			kind: "status",
			status: "draft",
		});
		expect(describeSpecChange(change({ before: spec("draft"), after: spec(undefined) }))).toEqual({
			path: PATH,
			title: "Channel content",
			kind: "status",
			previousStatus: "draft",
		});
	});

	it("is quiet on a further push unless it adds a spec or changes a status", () => {
		const push = (over: Partial<SpecChange>) => describeSpecChange(change({ event: "updated", ...over }));

		expect(push({ before: spec("proposed"), after: spec("proposed", "Typo fixed") })).toBeUndefined();
		expect(push({ before: spec("proposed"), after: spec("accepted") })?.kind).toBe("status");
		expect(push({})?.kind).toBe("new");
	});

	it("announces that the spec landed, with the status it landed with", () => {
		expect(
			describeSpecChange(change({ event: "merged", before: spec("proposed"), after: spec("accepted") }))
		).toEqual({
			path: PATH,
			title: "Channel content",
			kind: "merged",
			status: "accepted",
		});
		expect(describeSpecChange(change({ event: "merged", after: spec(undefined) }))?.kind).toBe("merged");
	});

	it("leaves a file that is not a spec alone, and a spec the event removed", () => {
		expect(describeSpecChange(change({ path: "docs/wiki/decisions/0001-x.md" }))).toBeUndefined();
		expect(describeSpecChange(change({ path: ".notes/README.md" }))).toBeUndefined();
		expect(describeSpecChange(change({ before: spec("draft"), after: undefined }))).toBeUndefined();
	});

	it("treats a settled spec in the wiki folder as a spec", () => {
		expect(describeSpecChange(change({ path: "docs/wiki/specifications/tech-x.spec.md" }))?.kind).toBe("new");
	});
});
