import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BrunoTooling } from "./tooling.js";

const SCHEMA = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";
const REFS = { secret: "A_SECRET" };
const LAYERS = { "A (local)": "dev" };
const ENV_FILE = ".bruno/collections/app-a/environments/A (local).yml";

let root: string;
const put = (path: string, value: unknown) => {
	mkdirSync(join(root, path, ".."), { recursive: true });
	writeFileSync(join(root, path), JSON.stringify(value));
};
const read = (path: string) => readFileSync(join(root, path), "utf8");

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "bruno-secret-refs-"));
	put("apps/a/api/webhook.collection.json", {
		info: { name: "App A", schema: SCHEMA },
		item: [{ name: "ping", request: { method: "GET", url: "{{baseUrl}}/ping" } }],
	});
	put("apps/a/api/webhook.environment.json", {
		name: "A (local)",
		values: [
			{ key: "baseUrl", value: "http://x", type: "default", enabled: true },
			{ key: "secret", value: "", type: "secret", enabled: true },
			{ key: "other", value: "", type: "secret", enabled: true },
		],
	});
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const input = () => ({
	collectionFiles: ["apps/a/api/webhook.collection.json"],
	envFiles: ["apps/a/api/webhook.environment.json"],
	repoRoot: root,
});
const tool = (secretRefs: Record<string, string> | null = REFS) =>
	new BrunoTooling({ repoRoot: root, ...(secretRefs ? { secretRefs, environmentLayers: LAYERS } : {}) });

describe("BrunoTooling.workspace with secretRefs", () => {
	it("writes a named secret as a plain variable that refers to its entry, and leaves other secrets blank", async () => {
		await tool().workspace(input());
		const text = read(ENV_FILE);
		expect(text).toContain('value: "{{process.env.DEV_A_SECRET}}"');
		expect(text).not.toMatch(/secret: true\n\s+name: secret\b/);
		expect(text).toMatch(/secret: true\n\s+name: other/);
	});

	it("keeps the request file's secret blank, and is a no-op the second time", async () => {
		await tool().workspace(input());
		expect(read("apps/a/api/webhook.environment.json")).not.toContain("process.env");
		const again = await tool().workspace(input());
		expect(new Set(again.files.map((f) => f.state))).toEqual(new Set(["unchanged"]));
	});

	it("regenerates the reference when the request file changes", async () => {
		await tool().workspace(input());
		put("apps/a/api/webhook.environment.json", {
			name: "A (local)",
			values: [
				{ key: "baseUrl", value: "http://changed", type: "default", enabled: true },
				{ key: "secret", value: "", type: "secret", enabled: true },
			],
		});
		const result = await tool().workspace(input());
		expect(result.files.find((f) => f.path === ENV_FILE)?.state).toBe("changed");
		const text = read(ENV_FILE);
		expect(text).toContain("http://changed");
		expect(text).toContain("{{process.env.DEV_A_SECRET}}");
	});

	it("does not copy a reference back into the request file when the workspace's environment is edited", async () => {
		await tool().workspace(input());
		writeFileSync(join(root, ENV_FILE), read(ENV_FILE).replace("http://x", "http://edited"));
		await tool().workspace(input());
		const source = read("apps/a/api/webhook.environment.json");
		expect(source).toContain("http://edited");
		expect(source).not.toContain("process.env");
		expect(JSON.parse(source).values.find((v: { key: string }) => v.key === "secret")).toMatchObject({
			type: "secret",
			value: "",
		});
	});

	it("adds the references to a workspace that was written without them, once, and keeps the rest of the file", async () => {
		await tool(null).workspace(input());
		const before = read(ENV_FILE);
		const dry = await tool().workspace({ ...input(), dryRun: true });
		expect(dry.files.find((f) => f.path === ENV_FILE)?.state).toBe("changed");
		expect(read(ENV_FILE)).toBe(before);
		await tool().workspace(input());
		expect(read(ENV_FILE)).toContain("{{process.env.DEV_A_SECRET}}");
		expect(read(ENV_FILE)).toContain("http://x");
		const again = await tool().workspace(input());
		expect(new Set(again.files.map((f) => f.state))).toEqual(new Set(["unchanged"]));
		expect(read("apps/a/api/webhook.environment.json")).not.toContain("process.env");
	});

	it("writes nothing but blank secrets without the option", async () => {
		await tool(null).workspace(input());
		expect(read(ENV_FILE)).not.toContain("process.env");
	});
});

describe("BrunoTooling.open", () => {
	it("lists what the written workspace refers to", async () => {
		await tool().workspace(input());
		// `app` is set so the plan does not depend on the platform: only macOS has a default program.
		const plan = await new BrunoTooling({
			repoRoot: root,
			app: "/opt/bruno",
			secretRefs: REFS,
			environmentLayers: LAYERS,
		}).open(input());
		expect(plan.wants).toEqual([
			{
				collection: "collections/app-a",
				variable: "secret",
				layer: "dev",
				entry: "A_SECRET",
				name: "DEV_A_SECRET",
			},
		]);
		expect(plan.unfilled).toEqual(["collections/app-a (A (local)): other"]);
		expect(plan.targets).toEqual([join(root, ".bruno/collections/app-a/.env")]);
	});

	it("takes the program from the app option", async () => {
		await tool().workspace(input());
		const plan = await new BrunoTooling({
			repoRoot: root,
			app: "/opt/bruno",
			secretRefs: REFS,
			environmentLayers: LAYERS,
		}).open(input());
		expect(plan.launch).toEqual({ command: "/opt/bruno", args: [join(root, ".bruno")] });
		expect(plan.running).toBe("/opt/bruno");
	});
});
