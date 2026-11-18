import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MACOS_APP, openPlan } from "./open-plan.js";
import type { SecretWiring } from "./secret-references.js";

let root: string;
const put = (path: string, text: string) => {
	mkdirSync(join(root, path, ".."), { recursive: true });
	writeFileSync(join(root, path), text);
};
const baseline = (folders: string[]) =>
	JSON.stringify({
		version: 1,
		pairs: folders.map((folder) => ({
			kind: "collection",
			source: `api/${folder}.collection.json`,
			workspace: `collections/${folder}`,
			sourceHash: "a",
			workspaceHash: "b",
		})),
	});
const environment = (name: string, ...variables: string[]) => `name: ${name}\nvariables:\n${variables.join("\n")}\n`;
const plain = (name: string, value: string) => `  - name: ${name}\n    value: ${JSON.stringify(value)}`;
const secret = (name: string) => `  - secret: true\n    name: ${name}`;
const input = (...names: string[]) => ({
	collectionFiles: names.map((n) => `api/${n}.collection.json`),
	envFiles: [],
	repoRoot: root,
});

beforeEach(() => void (root = mkdtempSync(join(tmpdir(), "bruno-open-"))));
afterEach(() => rmSync(root, { recursive: true, force: true }));

const WIRING: SecretWiring = {
	refs: { signing: "A_SIGNING", n: "B_N" },
	layers: { Dev: "dev", Prod: "prod", Local: "local" },
};

describe("openPlan", () => {
	it("maps each reference to its layer and entry, per collection, once, and names what nothing fills", async () => {
		put(".bruno/.sync.json", baseline(["a", "b"]));
		put(
			".bruno/collections/a/environments/Dev.yml",
			environment(
				"Dev",
				plain("baseUrl", "http://x"),
				plain("signing", "{{process.env.DEV_A_SIGNING}}"),
				secret("loose")
			)
		);
		put(
			".bruno/collections/a/environments/Prod.yml",
			environment("Prod", plain("signing", "{{process.env.PROD_A_SIGNING}}"), secret("loose"))
		);
		put(
			".bruno/collections/a/environments/Prod2.yml",
			environment("Prod", plain("signing", "{{process.env.PROD_A_SIGNING}}"))
		);
		put(
			".bruno/collections/b/environments/Dev.yml",
			environment("Dev", secret("signing"), plain("n", "{{ process.env.DEV_B_N }}"))
		);
		const plan = await openPlan(input("a", "b"), { platform: "darwin", wiring: WIRING });
		expect(plan.wants).toEqual([
			{
				collection: "collections/a",
				variable: "signing",
				layer: "dev",
				entry: "A_SIGNING",
				name: "DEV_A_SIGNING",
			},
			{
				collection: "collections/a",
				variable: "signing",
				layer: "prod",
				entry: "A_SIGNING",
				name: "PROD_A_SIGNING",
			},
			{ collection: "collections/b", variable: "n", layer: "dev", entry: "B_N", name: "DEV_B_N" },
		]);
		expect(plan.unfilled).toEqual([
			"collections/a (Dev): loose",
			"collections/a (Prod): loose",
			"collections/b (Dev): signing",
		]);
		expect(plan.targets).toEqual([
			join(root, ".bruno/collections/a/.env"),
			join(root, ".bruno/collections/b/.env"),
		]);
		expect(plan.app).toBe("Bruno");
		expect(plan.launch).toEqual({ command: MACOS_APP, args: [join(root, ".bruno")] });
		expect(plan.running).toBe(MACOS_APP);
	});

	it("reports a reference the options do not account for, instead of skipping it", async () => {
		put(".bruno/.sync.json", baseline(["a"]));
		put(
			".bruno/collections/a/environments/Dev.yml",
			environment("Dev", plain("signing", "{{process.env.A_SIGNING}}"), plain("n", "{{process.env.DEV_B_N}}"))
		);
		put(
			".bruno/collections/a/environments/Other.yml",
			environment("Other", plain("signing", "{{process.env.DEV_A_SIGNING}}"))
		);
		const plan = await openPlan(input("a"), { platform: "darwin", wiring: WIRING });
		expect(plan.wants).toEqual([
			{ collection: "collections/a", variable: "n", layer: "dev", entry: "B_N", name: "DEV_B_N" },
		]);
		expect(plan.unfilled).toEqual([
			"collections/a (Dev): signing refers to A_SIGNING, which no secretRefs and environmentLayers give",
			"collections/a (Other): signing refers to DEV_A_SIGNING, which no secretRefs and environmentLayers give",
		]);
	});

	it("fills nothing without wiring: every reference is unaccounted for", async () => {
		put(".bruno/.sync.json", baseline(["a"]));
		put(
			".bruno/collections/a/environments/Dev.yml",
			environment("Dev", plain("signing", "{{process.env.DEV_A_SIGNING}}"))
		);
		const plan = await openPlan(input("a"), { platform: "darwin" });
		expect(plan.wants).toEqual([]);
		expect(plan.unfilled).toHaveLength(1);
	});

	it("reads only the collections the request files name, and none from a folder with no environments", async () => {
		put(".bruno/.sync.json", baseline(["a", "b"]));
		put(".bruno/collections/b/environments/Dev.yml", environment("Dev", plain("n", "{{process.env.DEV_B_N}}")));
		const plan = await openPlan(input("a"), { platform: "darwin" });
		expect(plan.wants).toEqual([]);
		expect(plan.targets).toEqual([join(root, ".bruno/collections/a/.env")]);
	});

	it("fails when there is no workspace for the collections", async () => {
		await expect(openPlan(input("a"), { platform: "darwin" })).rejects.toThrow(
			/run `holocron sync requests` first/
		);
		put(".bruno/.sync.json", baseline(["a"]));
		await expect(openPlan(input("zzz"), { platform: "darwin" })).rejects.toThrow(/no \.bruno\/ workspace to open/);
	});

	it("needs the app option off macOS, and takes it when given", async () => {
		put(".bruno/.sync.json", baseline(["a"]));
		await expect(openPlan(input("a"), { platform: "linux" })).rejects.toThrow(/set the `app` option/);
		const plan = await openPlan(input("a"), { platform: "linux", app: "/opt/Bruno/bruno" });
		expect(plan.launch.command).toBe("/opt/Bruno/bruno");
	});

	it("reads the platform from the process when none is given", async () => {
		put(".bruno/.sync.json", baseline(["a"]));
		const real = Object.getOwnPropertyDescriptor(process, "platform") as PropertyDescriptor;
		try {
			Object.defineProperty(process, "platform", { value: "darwin" });
			expect((await openPlan(input("a"))).launch.command).toBe(MACOS_APP);
			Object.defineProperty(process, "platform", { value: "linux" });
			await expect(openPlan(input("a"))).rejects.toThrow(/set the `app` option/);
		} finally {
			Object.defineProperty(process, "platform", real);
		}
	});

	it("rethrows a read error that is not a missing folder", async () => {
		put(".bruno/.sync.json", baseline(["a"]));
		put(".bruno/collections/a/environments", "a file, not a folder");
		await expect(openPlan(input("a"), { platform: "darwin" })).rejects.toThrow();
	});
});
