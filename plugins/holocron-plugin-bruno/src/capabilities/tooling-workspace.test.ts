import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BrunoTooling } from "./tooling.js";

const SCHEMA = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";
const collection = (name: string, ...requests: string[]) => ({
	info: { name, schema: SCHEMA },
	item: requests.map((request) => ({ name: request, request: { method: "GET", url: `{{baseUrl}}/${request}` } })),
});
const environment = (name: string) => ({
	name,
	values: [
		{ key: "baseUrl", value: "http://x", type: "default", enabled: true },
		{ key: "secret", value: "never-written", type: "secret", enabled: true },
	],
});

let root: string;
const put = (path: string, value: unknown) => {
	mkdirSync(join(root, path, ".."), { recursive: true });
	writeFileSync(join(root, path), JSON.stringify(value));
};
const read = (path: string) => readFileSync(join(root, path), "utf8");

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "bruno-workspace-"));
	put("apps/a/api/webhook.collection.json", collection("App A", "ping"));
	put("apps/a/api/webhook.environment.json", environment("A (local)"));
	put("apps/b/api/webhook.collection.json", collection("App B", "pong"));
	put("apps/b/api/webhook.environment.json", environment("B (local)"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const input = (over: Record<string, unknown> = {}) => ({
	collectionFiles: ["apps/a/api/webhook.collection.json", "apps/b/api/webhook.collection.json"],
	envFiles: ["apps/a/api/webhook.environment.json", "apps/b/api/webhook.environment.json"],
	repoRoot: root,
	...over,
});
const tool = (workspaceName?: string) =>
	new BrunoTooling({ repoRoot: root, ...(workspaceName ? { workspaceName } : {}) });
const states = (files: { path: string; state: string }[]) => Object.fromEntries(files.map((f) => [f.path, f.state]));

describe("BrunoTooling.workspace", () => {
	it("writes the workspace file and one folder of Bruno's own files per collection", async () => {
		const result = await tool("The Holocron").workspace(input());
		expect(result.issues).toEqual([]);
		expect(Object.values(states(result.files))).toEqual(Array(result.files.length).fill("new"));
		expect(result.files.map((f) => f.path)).toEqual([
			".bruno/.sync.json",
			".bruno/collections/app-a/environments/A (local).yml",
			".bruno/collections/app-a/opencollection.yml",
			".bruno/collections/app-a/ping.yml",
			".bruno/collections/app-b/environments/B (local).yml",
			".bruno/collections/app-b/opencollection.yml",
			".bruno/collections/app-b/pong.yml",
			".bruno/workspace.yml",
		]);
		expect(read(".bruno/workspace.yml")).toBe(
			[
				"opencollection: 1.0.0",
				"info:",
				'  name: "The Holocron"',
				"  type: workspace",
				"",
				"collections:",
				'  - name: "App A"',
				'    path: "collections/app-a"',
				'  - name: "App B"',
				'    path: "collections/app-b"',
				"",
			].join("\n")
		);
	});

	it("gives each collection only the environments beside it", async () => {
		await tool().workspace(input());
		expect(existsSync(join(root, ".bruno/collections/app-a/environments/A (local).yml"))).toBe(true);
		expect(existsSync(join(root, ".bruno/collections/app-a/environments/B (local).yml"))).toBe(false);
		expect(existsSync(join(root, ".bruno/collections/app-b/environments/A (local).yml"))).toBe(false);
	});

	it("hands a collection every environment when none sits beside it", async () => {
		await tool().workspace(input({ envFiles: ["apps/a/api/webhook.environment.json"] }));
		expect(existsSync(join(root, ".bruno/collections/app-b/environments/A (local).yml"))).toBe(true);
	});

	it("never writes the value of a secret variable", async () => {
		await tool().workspace(input());
		expect(read(".bruno/collections/app-a/environments/A (local).yml")).not.toContain("never-written");
	});

	it("is a no-op the second time", async () => {
		await tool().workspace(input());
		const again = await tool().workspace(input());
		expect(new Set(again.files.map((f) => f.state))).toEqual(new Set(["unchanged"]));
	});

	it("changes a file the source no longer matches, and removes one it no longer generates", async () => {
		await tool().workspace(input());
		put("apps/a/api/webhook.collection.json", collection("App A", "ping-two"));
		const result = await tool().workspace(input());
		expect(states(result.files)).toMatchObject({
			".bruno/collections/app-a/opencollection.yml": "unchanged",
			".bruno/collections/app-a/ping-two.yml": "new",
			".bruno/collections/app-a/ping.yml": "removed",
		});
		expect(existsSync(join(root, ".bruno/collections/app-a/ping.yml"))).toBe(false);
		expect(existsSync(join(root, ".bruno/collections/app-a/ping-two.yml"))).toBe(true);
	});

	it("removes the folder of a request that was in a folder of its own, once it is empty", async () => {
		put("apps/a/api/webhook.collection.json", {
			info: { name: "App A", schema: SCHEMA },
			item: [{ name: "Group", item: [{ name: "one", request: { method: "GET", url: "http://x" } }] }],
		});
		await tool().workspace(input());
		expect(existsSync(join(root, ".bruno/collections/app-a/Group/folder.yml"))).toBe(true);
		put("apps/a/api/webhook.collection.json", collection("App A", "ping"));
		await tool().workspace(input());
		expect(existsSync(join(root, ".bruno/collections/app-a/Group"))).toBe(false);
	});

	it("writes and deletes nothing on a dry run, and still says what would change", async () => {
		const result = await tool().workspace(input({ dryRun: true }));
		expect(result.files.length).toBeGreaterThan(0);
		expect(existsSync(join(root, ".bruno"))).toBe(false);
		await tool().workspace(input());
		put("apps/a/api/webhook.collection.json", collection("App A", "ping-two"));
		const dry = await tool().workspace(input({ dryRun: true }));
		expect(states(dry.files)[".bruno/collections/app-a/ping.yml"]).toBe("removed");
		expect(existsSync(join(root, ".bruno/collections/app-a/ping.yml"))).toBe(true);
	});

	it("leaves a workspace file alone while it lists every collection, because Bruno adds settings to it", async () => {
		await tool("The Holocron").workspace(input());
		const withActive = `${read(".bruno/workspace.yml")}activeEnvironmentUid: abc\n`;
		writeFileSync(join(root, ".bruno/workspace.yml"), withActive);
		const result = await tool("The Holocron").workspace(input());
		expect(states(result.files)[".bruno/workspace.yml"]).toBe("unchanged");
		expect(read(".bruno/workspace.yml")).toBe(withActive);
	});

	it("writes the workspace file again when it does not list a collection", async () => {
		await tool().workspace(input({ collectionFiles: ["apps/a/api/webhook.collection.json"] }));
		const result = await tool().workspace(input());
		expect(states(result.files)[".bruno/workspace.yml"]).toBe("changed");
		expect(read(".bruno/workspace.yml")).toContain("collections/app-b");
	});

	describe("a collection added to a workspace file that Bruno has written to", () => {
		const first = () =>
			tool("The Holocron").workspace(input({ collectionFiles: ["apps/a/api/webhook.collection.json"] }));
		const bruno = [
			"opencollection: 1.0.0",
			"info:",
			'  name: "The Holocron"',
			"  type: workspace",
			"",
			"collections:",
			'  - name: "App A"',
			'    path: "collections/app-a"',
			"",
			"specs:",
			"",
			"docs: |-",
			"  # The Holocron",
			"",
			"  Some words.",
			"activeEnvironmentUid: abc",
			"",
		].join("\n");

		it("keeps the docs, the specs and the active environment, and adds only the entry", async () => {
			await first();
			writeFileSync(join(root, ".bruno/workspace.yml"), bruno);
			const result = await tool("The Holocron").workspace(input());
			expect(states(result.files)[".bruno/workspace.yml"]).toBe("changed");
			expect(read(".bruno/workspace.yml")).toBe(
				bruno.replace(
					'    path: "collections/app-a"\n',
					'    path: "collections/app-a"\n  - name: "App B"\n    path: "collections/app-b"\n'
				)
			);
		});

		it("writes the entry in the style of a whole file", async () => {
			await first();
			await tool("The Holocron").workspace(input());
			const grown = read(".bruno/workspace.yml");
			rmSync(join(root, ".bruno"), { recursive: true });
			await tool("The Holocron").workspace(input());
			expect(grown).toBe(read(".bruno/workspace.yml"));
		});

		it("fills in an empty `collections: []`", async () => {
			await first();
			writeFileSync(
				join(root, ".bruno/workspace.yml"),
				'opencollection: 1.0.0\ninfo:\n  name: "W"\n  type: workspace\n\ncollections: []\ndocs: x\n'
			);
			await tool("The Holocron").workspace(input());
			expect(read(".bruno/workspace.yml")).toBe(
				[
					"opencollection: 1.0.0",
					"info:",
					'  name: "W"',
					"  type: workspace",
					"",
					"collections:",
					'  - name: "App A"',
					'    path: "collections/app-a"',
					'  - name: "App B"',
					'    path: "collections/app-b"',
					"docs: x",
					"",
				].join("\n")
			);
		});

		it("fills in a `collections:` with no entries", async () => {
			await first();
			writeFileSync(join(root, ".bruno/workspace.yml"), "info:\n  name: W\n\ncollections:\n\ndocs: x\n");
			await tool("The Holocron").workspace(input());
			expect(read(".bruno/workspace.yml")).toBe(
				[
					"info:",
					"  name: W",
					"",
					"collections:",
					'  - name: "App A"',
					'    path: "collections/app-a"',
					'  - name: "App B"',
					'    path: "collections/app-b"',
					"",
					"docs: x",
					"",
				].join("\n")
			);
		});

		it("makes the whole file when `collections:` is a flow list it cannot add to in place", async () => {
			await first();
			writeFileSync(
				join(root, ".bruno/workspace.yml"),
				'opencollection: 1.0.0\ncollections: [{ name: "Old", path: "collections/old" }]\ndocs: x\n'
			);
			await tool("The Holocron").workspace(input());
			expect(read(".bruno/workspace.yml")).toContain('  - name: "App A"');
			expect(read(".bruno/workspace.yml")).toContain('  - name: "App B"');
			expect(read(".bruno/workspace.yml")).not.toContain("Old");
		});

		it("makes the whole file when it has no `collections:` key", async () => {
			await first();
			writeFileSync(join(root, ".bruno/workspace.yml"), "opencollection: 1.0.0\ndocs: x\n");
			await tool("The Holocron").workspace(input());
			expect(read(".bruno/workspace.yml")).toContain('  - name: "App B"');
			expect(read(".bruno/workspace.yml")).toContain('  - name: "App A"');
			expect(read(".bruno/workspace.yml")).not.toContain("docs: x");
		});
	});

	it("names the workspace `Workspace` when no name is set", async () => {
		await tool().workspace(input());
		expect(read(".bruno/workspace.yml")).toContain('name: "Workspace"');
	});

	it("gives two collections of the same name their own folders", async () => {
		put("apps/b/api/webhook.collection.json", collection("App A", "pong"));
		await tool().workspace(input());
		expect(existsSync(join(root, ".bruno/collections/app-a/opencollection.yml"))).toBe(true);
		expect(existsSync(join(root, ".bruno/collections/app-a-2/opencollection.yml"))).toBe(true);
	});

	it("leaves the other folders of the workspace alone, such as the mock servers Bruno keeps in mocks/", async () => {
		await tool().workspace(input());
		mkdirSync(join(root, ".bruno/mocks"), { recursive: true });
		writeFileSync(join(root, ".bruno/mocks/stand-in.yml"), "info:\n  name: stand-in\n  type: mock\n");
		const result = await tool().workspace(input());
		expect(result.files.some((file) => file.path.includes("mocks/"))).toBe(false);
		expect(new Set(result.files.map((file) => file.state))).toEqual(new Set(["unchanged"]));
		expect(read(".bruno/mocks/stand-in.yml")).toContain("name: stand-in");
	});

	it("names the file when a collection cannot be read", async () => {
		writeFileSync(join(root, "apps/a/api/webhook.collection.json"), "not json");
		await expect(tool().workspace(input())).rejects.toThrow(/apps\/a\/api\/webhook\.collection\.json/);
	});

	it("names the file when a collection cannot be converted", async () => {
		put("apps/a/api/webhook.collection.json", { info: { name: "Bad" }, item: "no" });
		await expect(tool().workspace(input())).rejects.toThrow(/apps\/a\/api\/webhook\.collection\.json/);
	});
});
