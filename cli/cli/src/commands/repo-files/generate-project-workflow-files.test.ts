import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveConfig } from "../../config/index.js";
import {
	generateProjectWorkflowFiles,
	PROJECT_APP_SECRETS,
	PROJECT_RECONCILE_NAME,
	PROJECT_RECONCILE_WORKFLOW,
} from "./generate-project-workflow-files.js";
import { generateRepoFiles } from "./generate-repo-files.js";

let root: string;
beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "project-workflow-"));
	mkdirSync(join(root, ".git"));
});
afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

const input = (raw: Record<string, unknown>) => ({
	repoRoot: root,
	loaded: {
		resolved: resolveConfig({ name: "demo", ...raw } as Parameters<typeof resolveConfig>[0]),
		filepath: join(root, "holocron.config.json"),
	},
});

describe("generateProjectWorkflowFiles", () => {
	const boards = [{ template: "roadmap", name: "v5" }];

	it("writes the hourly workflow when providers.projects declares boards", () => {
		const [file] = generateProjectWorkflowFiles(
			input({ org: "theholocron", providers: { projects: ["github", { boards }] } })
		);
		expect(file!.path).toBe(PROJECT_RECONCILE_WORKFLOW);
		expect(file!.content).toMatch(/^# AUTO-GENERATED/);
		expect(file!.content).toContain("# Source package: .");
		expect(file!.content).toContain(`name: ${PROJECT_RECONCILE_NAME}`);
		expect(file!.content).toContain("cron:");
		expect(file!.content).toContain("workflow_dispatch:");
		expect(file!.content.indexOf("command: project reconcile")).toBeLessThan(
			file!.content.indexOf("command: doctor project")
		);
		expect(file!.content).toContain(`secrets.${PROJECT_APP_SECRETS.id}`);
		expect(file!.content).toContain(`secrets.${PROJECT_APP_SECRETS.privateKey}`);
		expect(file!.content).toContain("owner: theholocron");
		expect(file!.content).toContain("permission-organization-projects: write");
	});

	it("takes the owner from the org option before the config's org", () => {
		const [file] = generateProjectWorkflowFiles(
			input({ org: "a", providers: { projects: ["github", { org: "b", boards }] } })
		);
		expect(file!.content).toContain("owner: b");
	});

	it("writes nothing without the provider, without boards or without an owner", () => {
		expect(generateProjectWorkflowFiles(input({ org: "x", providers: {} }))).toEqual([]);
		expect(generateProjectWorkflowFiles(input({ org: "x", providers: { projects: "github" } }))).toEqual([]);
		expect(generateProjectWorkflowFiles(input({ providers: { projects: ["github", { boards }] } }))).toEqual([]);
		expect(
			generateProjectWorkflowFiles(input({ org: "x", providers: { projects: ["github", { boards: 3 }] } }))
		).toEqual([]);
	});

	it("is part of generateRepoFiles, and the same bytes twice", async () => {
		const raw = { org: "theholocron", providers: { projects: ["github", { boards }] } };
		const first = await generateRepoFiles(input(raw));
		const second = await generateRepoFiles(input(raw));
		const pick = (entries: typeof first) =>
			entries.find((e) => e.kind === "file" && e.path === PROJECT_RECONCILE_WORKFLOW);
		expect(pick(first)).toBeDefined();
		expect(pick(first)).toEqual(pick(second));
		const without = await generateRepoFiles(input({ org: "theholocron", providers: {} }));
		expect(pick(without)).toBeUndefined();
	});
});
