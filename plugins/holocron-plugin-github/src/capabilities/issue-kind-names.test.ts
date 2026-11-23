import type { GitHubClient, GitHubIssue } from "@theholocron/github-client";
import { describe, expect, it, vi } from "vitest";

import { hasKindType, kindNames, kindOfIssue, writeKind } from "./issue-kind.js";

const issue = (type: string | undefined, labels: string[] = []) =>
	({ type: type ? { name: type } : null, labels: labels.map((name) => ({ name })) }) as unknown as GitHubIssue;

describe("kindNames", () => {
	it("knows the core three with nothing declared", () => {
		const names = kindNames(undefined);
		expect(["bug", "feature", "task"].map((k) => names.nameOf(k))).toEqual(["Bug", "Feature", "Task"]);
	});

	it("writes a declared Type in the declared spelling, and a core one in its own", () => {
		const names = kindNames([{ name: "Epic" }, { name: "BUG" }, { name: "DevOps" }]);
		expect(names.nameOf("epic")).toBe("Epic");
		expect(names.nameOf("devops")).toBe("DevOps");
		expect(names.nameOf("bug")).toBe("Bug");
	});

	it("capitalises an undeclared kind rather than throwing", () => {
		expect(kindNames(undefined).nameOf("spike")).toBe("Spike");
	});
});

describe("kindOfIssue", () => {
	it("reads a Type outside the core three as its lower-case name, declared or not", () => {
		expect(kindOfIssue(issue("Epic"))).toBe("epic");
		expect(kindOfIssue(issue("Spike"), kindNames([{ name: "Spike" }]))).toBe("spike");
	});

	it("falls back to the one kind the labels name, and to none for two", () => {
		expect(kindOfIssue(issue(undefined, ["enhancement"]))).toBe("feature");
		expect(kindOfIssue(issue(undefined, ["bug", "enhancement"]))).toBeUndefined();
	});
});

describe("hasKindType and writeKind", () => {
	it("compares against the declared spelling, ignoring case", () => {
		const names = kindNames([{ name: "Epic" }]);
		expect(hasKindType(issue("epic"), "epic", names)).toBe(true);
		expect(hasKindType(issue("Task"), "epic", names)).toBe(false);
	});

	it("sends the declared spelling as the Type", async () => {
		const updateIssue = vi.fn().mockResolvedValue(undefined);
		const client = { issues: { updateIssue } } as unknown as GitHubClient;
		await expect(writeKind(client, "o/r", 7, "epic", kindNames([{ name: "Epic" }]))).resolves.toBeUndefined();
		expect(updateIssue).toHaveBeenCalledWith("o/r", 7, { type: "Epic" });
	});
});
