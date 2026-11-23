import { describe, expect, it } from "vitest";

import { kindCommitTypes, workTitle } from "./work-title.js";

describe("workTitle", () => {
	it("maps the issue's kind to the commit type", () => {
		expect(workTitle({ issueTitle: "Add it", kind: "bug" }).title).toBe("fix: Add it");
		expect(workTitle({ issueTitle: "Add it", kind: "feature" }).title).toBe("feat: Add it");
		expect(workTitle({ issueTitle: "Add it", kind: "task" }).title).toBe("chore: Add it");
	});

	it("keeps the scope and drops emoji from a title that is already a Conventional Commit", () => {
		expect(workTitle({ issueTitle: "feat(cli): ✨ work commands" })).toMatchObject({
			title: "feat(cli): work commands",
			type: "feat",
			scope: "cli",
			reason: "the issue's title says so",
		});
	});

	it("uses a declared Type's commit type, and chore for one that has none unless the title says otherwise", () => {
		const kindTypes = kindCommitTypes([{ name: "Epic" }, { name: "Spike" }, { name: "Chore", commit: "perf" }]);
		expect(kindTypes).toMatchObject({ bug: "fix", chore: "perf" });
		expect(workTitle({ issueTitle: "Add it", kind: "chore", kindTypes }).title).toBe("perf: Add it");
		const epic = workTitle({ issueTitle: "Add it", kind: "epic", kindTypes, labels: ["bug"] });
		expect(epic).toMatchObject({ title: "chore: Add it", type: "chore" });
		expect(epic.reason).toMatch(/no commit type/);
		expect(workTitle({ issueTitle: "docs(x): Add it", kind: "spike", kindTypes }).title).toBe("docs(x): Add it");
	});

	it("lets the kind win over the title's own type", () => {
		expect(workTitle({ issueTitle: "chore(ci): x", kind: "bug" }).title).toBe("fix(ci): x");
	});

	it("reads a kind label, then falls back to chore", () => {
		expect(workTitle({ issueTitle: "Crash", labels: ["cli", "bug"] }).type).toBe("fix");
		expect(workTitle({ issueTitle: "More", labels: ["enhancement"] }).type).toBe("feat");
		expect(workTitle({ issueTitle: "Docs", labels: ["documentation"] }).type).toBe("docs");
		const fallback = workTitle({ issueTitle: "Odd", labels: ["x"] });
		expect(fallback.type).toBe("chore");
		expect(fallback.reason).toMatch(/no kind/);
	});

	it("is docs(specs) when the pull request carries only the spec", () => {
		expect(workTitle({ issueTitle: "feat(cli): work commands", kind: "feature", specOnly: true })).toMatchObject({
			title: "docs(specs): work commands",
			type: "docs",
		});
	});

	it("does not take an unknown word before a colon for a type", () => {
		expect(workTitle({ issueTitle: "Note: this" }).title).toBe("chore: Note: this");
	});
});
