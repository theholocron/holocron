import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { load } from "js-yaml";
import { afterEach, describe, expect, it } from "vitest";

import { BrunoTooling } from "./capabilities/tooling.js";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

interface Item {
	type: string;
	name: string;
	scripts?: Record<string, string>;
	items?: Item[];
}
interface Doc {
	name: string;
	environments: { name: string; variables: { name: string; transient?: boolean }[] }[];
	items: Item[];
}

const everything = (items: Item[]): Item[] => items.flatMap((item) => [item, ...everything(item.items ?? [])]);
const requests = (items: Item[]): Item[] => items.flatMap((item) => (item.items ? requests(item.items) : [item]));

let out: string;
afterEach(() => rmSync(out, { recursive: true, force: true }));

describe.each([
	["sentinel", "webhookSecret"],
	["comlink", "sentrySecret"],
])("exporting the %s requests", (app, secret) => {
	it("converts the real collection and environment with no issues and no pm.* left", async () => {
		out = mkdtempSync(join(tmpdir(), "bruno-e2e-"));
		const files = [`apps/${app}/requests/collection.json`];
		const envFiles = [`apps/${app}/requests/environment.json`];
		const result = await new BrunoTooling().export({
			collectionFiles: files,
			envFiles,
			outDir: out,
			repoRoot: REPO_ROOT,
		});
		expect(result).toEqual({ files: ["collection.yml"], issues: [] });
		const text = readFileSync(join(out, "collection.yml"), "utf8");
		const doc = load(text) as Doc;

		// The scripts that sign each body ran on Postman's `pm` object; they are Bruno's own API now.
		expect(text).not.toMatch(/\bpm\./);
		// The signing script sits on a folder, so every item is searched, not only the requests.
		const signing = everything(doc.items).find((item) => item.scripts?.preRequest?.includes("HmacSHA256"));
		expect(signing?.scripts?.preRequest).toContain("bru.getVar(");
		expect(signing?.scripts?.preRequest).toContain("req.setHeader(");

		// Every request of the source is still there, and the environment came with the collection.
		const source = JSON.parse(readFileSync(join(REPO_ROOT, files[0] as string), "utf8")) as {
			item: { name: string; item?: unknown[] }[];
		};
		const count = (items: { item?: unknown[] }[]): number =>
			items.reduce((n, entry) => n + (entry.item ? count(entry.item as { item?: unknown[] }[]) : 1), 0);
		expect(requests(doc.items)).toHaveLength(count(source.item));
		expect(doc.environments).toHaveLength(1);
		expect(doc.environments[0]?.variables.find((variable) => variable.name === secret)?.transient).toBe(true);
	});
});
