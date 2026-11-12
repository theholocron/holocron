import { describe, expect, it } from "vitest";

import { accessNote, describeAccess } from "./access-note.js";

const wanted = { visibility: "selected" as const, repos: ["holocron", ".github"] };

describe("describeAccess", () => {
	it("names the repositories of a selected secret, sorted", () => {
		expect(describeAccess(wanted)).toBe("selected [.github, holocron]");
	});

	it("names the visibility of any other, and tolerates a selected secret with no list", () => {
		expect(describeAccess({ visibility: "all" })).toBe("all");
		expect(describeAccess({ visibility: "private" })).toBe("private");
		expect(describeAccess({ visibility: "selected" })).toBe("selected []");
	});
});

describe("accessNote", () => {
	it("says only the new readers when the secrets could not be read", () => {
		expect(accessNote(wanted, undefined, false)).toBe("readers -> selected [.github, holocron]");
	});

	it("says a secret that does not exist yet is new", () => {
		expect(accessNote(wanted, undefined, true)).toBe("new, readers selected [.github, holocron]");
	});

	it("says a secret that is already as declared is unchanged, whatever the order", () => {
		expect(accessNote(wanted, { visibility: "selected", repos: [".github", "holocron"] }, true)).toBe(
			"readers unchanged (selected [.github, holocron])"
		);
	});

	it("shows the change when the readers differ", () => {
		expect(accessNote(wanted, { visibility: "all" }, true)).toBe("readers all -> selected [.github, holocron]");
		expect(accessNote(wanted, { visibility: "selected", repos: ["holocron", "node-template"] }, true)).toBe(
			"readers selected [holocron, node-template] -> selected [.github, holocron]"
		);
	});
});
