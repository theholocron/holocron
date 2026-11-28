import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { issueKinds } from "../../commands/issue-fields/issue-kinds/index.js";
import { loadConfig } from "../config-system.js";
import { validateIssueTypes } from "../validate-issue-types/index.js";

const REPO_ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const gitExec = async () => "https://github.com/theholocron/holocron.git";

// This repo declares the organization's issue Types in `.holocron/org.ts` (SPEC-0106, #2512, part 6).
describe("this repo's issue Types", () => {
	it("are the five of the spec, in order, and validate", async () => {
		const { resolved } = await loadConfig(REPO_ROOT, { gitExec });
		const types = resolved.issueTypes;
		expect(types?.map((type) => type.name)).toEqual(["Bug", "Feature", "Task", "Epic", "Spike"]);
		expect(validateIssueTypes(types)).toEqual(types);
	});

	it("give the kinds bug, feature, task, epic and spike", async () => {
		const { resolved } = await loadConfig(REPO_ROOT, { gitExec });
		expect(issueKinds(resolved.issueTypes)).toEqual(["bug", "feature", "task", "epic", "spike"]);
	});

	it("carry the Linear label and commit type of the spec table", async () => {
		const { resolved } = await loadConfig(REPO_ROOT, { gitExec });
		const byName = Object.fromEntries((resolved.issueTypes ?? []).map((type) => [type.name, type]));
		expect(byName.Bug).toMatchObject({ label: "bug", commit: "fix" });
		expect(byName.Feature).toMatchObject({ label: "enhancement", commit: "feat" });
		expect(byName.Task).toMatchObject({ label: "chore", commit: "chore" });
		expect(byName.Epic).toMatchObject({ label: "epic", color: "purple" });
		expect(byName.Epic?.commit).toBeUndefined();
		expect(byName.Spike).toMatchObject({ label: "spike", color: "orange" });
		expect(byName.Spike?.commit).toBeUndefined();
	});
});
