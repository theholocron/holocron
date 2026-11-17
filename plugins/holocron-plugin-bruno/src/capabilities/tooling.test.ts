import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BrunoTooling } from "./tooling.js";

const collection = (name: string) => ({
	info: { name, schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
	item: [{ name: "ping", request: { method: "GET", url: "{{baseUrl}}/ping" } }],
});
const environment = { name: "Env", values: [{ key: "baseUrl", value: "http://x", type: "default", enabled: true }] };

let root: string;
beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "bruno-"));
	mkdirSync(join(root, "api"));
	writeFileSync(join(root, "api/webhook.collection.json"), JSON.stringify(collection("Demo")));
	writeFileSync(join(root, "api/webhook.environment.json"), JSON.stringify(environment));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const input = (over: Record<string, unknown> = {}) => ({
	collectionFiles: ["api/webhook.collection.json"],
	envFiles: ["api/webhook.environment.json"],
	outDir: join(root, "api/.export/bruno"),
	repoRoot: root,
	...over,
});

describe("BrunoTooling", () => {
	it("is the tooling provider `bruno`", () => {
		const tool = new BrunoTooling();
		expect([tool.key, tool.providerName]).toEqual(["tooling", "bruno"]);
	});

	it("sync does nothing and succeeds", async () => {
		await expect(new BrunoTooling({ repoRoot: root }).sync()).resolves.toBeUndefined();
		expect(readdirSync(join(root, "api")).sort()).toEqual(["webhook.collection.json", "webhook.environment.json"]);
	});

	describe("export", () => {
		it("writes one YAML file per collection, into the folder it is given", async () => {
			const result = await new BrunoTooling().export(input());
			expect(result).toEqual({ files: ["webhook.yml", "webhook.bruno.json"], issues: [] });
			const text = readFileSync(join(root, "api/.export/bruno/webhook.yml"), "utf8");
			expect(text).toContain("name: Demo");
			expect(text).toContain("name: Env");
		});

		it("also writes one Bruno JSON file per collection, with the environments inside it", async () => {
			await new BrunoTooling().export(
				input({
					envFiles: ["api/webhook.environment.json"],
				})
			);
			const doc = JSON.parse(readFileSync(join(root, "api/.export/bruno/webhook.bruno.json"), "utf8")) as {
				name: string;
				version: string;
				items: { name: string }[];
				environments: { name: string; filename?: string; variables: { name: string; secret: boolean }[] }[];
				brunoConfig: { type: string };
			};
			expect([doc.name, doc.version, doc.brunoConfig.type]).toEqual(["Demo", "1", "collection"]);
			expect(doc.items.map((item) => item.name)).toEqual(["ping"]);
			expect(doc.environments).toHaveLength(1);
			expect(doc.environments[0]?.name).toBe("Env");
			expect(doc.environments[0]?.variables.map((variable) => variable.name)).toEqual(["baseUrl"]);
			expect(doc.environments[0]).not.toHaveProperty("filename");
		});

		it("writes an empty environments list when there is no environment file", async () => {
			await new BrunoTooling().export(input({ envFiles: [] }));
			const doc = JSON.parse(readFileSync(join(root, "api/.export/bruno/webhook.bruno.json"), "utf8")) as {
				environments: unknown[];
			};
			expect(doc.environments).toEqual([]);
		});

		it("converts and lists the files but writes none on a dry run", async () => {
			const result = await new BrunoTooling().export(input({ dryRun: true }));
			expect(result.files).toEqual(["webhook.yml", "webhook.bruno.json"]);
			expect(readdirSync(join(root, "api"))).not.toContain(".export");
		});

		it("exports a collection with no environment file", async () => {
			const result = await new BrunoTooling().export(input({ envFiles: [] }));
			expect(result.files).toEqual(["webhook.yml", "webhook.bruno.json"]);
			expect(readFileSync(join(root, "api/.export/bruno/webhook.yml"), "utf8")).not.toContain("environments");
		});

		it("names two collections of the same file name apart", async () => {
			mkdirSync(join(root, "other"));
			writeFileSync(join(root, "other/webhook.collection.json"), JSON.stringify(collection("Other")));
			const result = await new BrunoTooling().export(
				input({ collectionFiles: ["api/webhook.collection.json", "other/webhook.collection.json"] })
			);
			expect(result.files).toEqual([
				"api-webhook.yml",
				"api-webhook.bruno.json",
				"other-webhook.yml",
				"other-webhook.bruno.json",
			]);
		});

		it("names the file that cannot be read", async () => {
			const err = await new BrunoTooling()
				.export(input({ collectionFiles: ["requests/missing.json"] }))
				.catch((e: unknown) => e);
			expect((err as Error).message).toMatch(/^requests\/missing\.json: /);
		});

		it("names the file that is not JSON", async () => {
			writeFileSync(join(root, "api/webhook.environment.json"), "{ nope");
			const err = await new BrunoTooling().export(input()).catch((e: unknown) => e);
			expect((err as Error).message).toMatch(/^api\/webhook\.environment\.json: /);
		});

		it("names the collection that cannot be converted", async () => {
			writeFileSync(join(root, "api/webhook.collection.json"), JSON.stringify({ nope: true }));
			const err = await new BrunoTooling().export(input()).catch((e: unknown) => e);
			expect((err as Error).message).toMatch(/^api\/webhook\.collection\.json: /);
		});

		it("names a path that is a folder, not a file", async () => {
			const err = await new BrunoTooling()
				.export(input({ collectionFiles: ["requests"] }))
				.catch((e: unknown) => e);
			expect((err as Error).message).toMatch(/^requests: /);
		});
	});

	describe("doctor", () => {
		it("is ok when every file reads and parses", async () => {
			const report = await new BrunoTooling({
				repoRoot: root,
				collectionFiles: ["api/webhook.collection.json"],
				envFiles: ["api/webhook.environment.json"],
			}).doctor();
			expect(report).toEqual({ ok: true, message: "2 request file(s) read" });
		});

		it("reads a file list with no environments", async () => {
			const report = await new BrunoTooling({
				repoRoot: root,
				collectionFiles: ["api/webhook.collection.json"],
			}).doctor();
			expect(report.ok).toBe(true);
		});

		it("is not ok with no collection files", async () => {
			const report = await new BrunoTooling({ repoRoot: root }).doctor();
			expect(report).toEqual({
				ok: false,
				message: "no `collectionFiles` are set, so there is nothing to export",
			});
		});

		it("lists every file that is missing or not JSON", async () => {
			writeFileSync(join(root, "api/webhook.environment.json"), "{ nope");
			const report = await new BrunoTooling({
				repoRoot: root,
				collectionFiles: ["api/webhook.collection.json", "requests/gone.json"],
				envFiles: ["api/webhook.environment.json"],
			}).doctor();
			expect(report.ok).toBe(false);
			expect(report.message).toContain("requests/gone.json: ");
			expect(report.message).toContain("api/webhook.environment.json: ");
			expect(report.message).not.toContain("api/webhook.collection.json");
		});
	});
});
