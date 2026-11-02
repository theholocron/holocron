import { describe, expect, it } from "vitest";

import { reconcileSpecStatus } from "./reconcile-spec-status.js";

describe("reconcileSpecStatus", () => {
	it("does nothing when the file, the tag and the last sync agree", () => {
		expect(reconcileSpecStatus({ file: "proposed", tag: "proposed", synced: "proposed" })).toEqual({
			action: "none",
		});
	});

	it("records the status when file and tag agree but the last-synced line is stale or missing", () => {
		expect(reconcileSpecStatus({ file: "accepted", tag: "accepted", synced: "proposed" })).toEqual({
			action: "record",
			status: "accepted",
		});
		expect(reconcileSpecStatus({ file: "accepted", tag: "accepted", synced: undefined })).toEqual({
			action: "record",
			status: "accepted",
		});
	});

	it("sets the tag when the post has none, or more than one status tag", () => {
		expect(reconcileSpecStatus({ file: "draft", tag: undefined, synced: "draft" })).toEqual({
			action: "set-tag",
			status: "draft",
		});
		expect(reconcileSpecStatus({ file: "draft", tag: undefined, synced: undefined })).toEqual({
			action: "set-tag",
			status: "draft",
		});
	});

	it("sets the tag to the file's status when only the file moved (a merged edit)", () => {
		expect(reconcileSpecStatus({ file: "accepted", tag: "proposed", synced: "proposed" })).toEqual({
			action: "set-tag",
			status: "accepted",
		});
	});

	it("asks for the file to change when only the tag moved (a gatekeeper retagged)", () => {
		expect(reconcileSpecStatus({ file: "proposed", tag: "accepted", synced: "proposed" })).toEqual({
			action: "request",
			status: "accepted",
		});
	});

	it("reports a conflict when both moved, saying where they last agreed", () => {
		const result = reconcileSpecStatus({ file: "accepted", tag: "archived", synced: "proposed" });

		expect(result).toEqual({
			action: "conflict",
			reason: "the file moved to accepted and the tag to archived since they last agreed on proposed",
		});
	});

	it("reports a conflict, and changes nothing, when there is no last sync to tell which moved", () => {
		expect(reconcileSpecStatus({ file: "accepted", tag: "draft", synced: undefined })).toEqual({
			action: "conflict",
			reason: "the file says accepted and the tag says draft, and nothing says which moved",
		});
	});

	it("reports a conflict for a file with no status, whatever the tag says", () => {
		expect(reconcileSpecStatus({ file: undefined, tag: "draft", synced: "draft" })).toEqual({
			action: "conflict",
			reason: "the file has no status to sync",
		});
	});
});
