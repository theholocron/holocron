import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { BrunoTooling } from "./capabilities/tooling.js";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

interface Item {
	type: string;
	name: string;
	items?: Item[];
}
interface Doc {
	name: string;
	environments: { name: string; variables: { name: string; secret: boolean }[] }[];
	items: Item[];
}

const requests = (items: Item[]): Item[] => items.flatMap((item) => (item.items ? requests(item.items) : [item]));

let out: string;
afterEach(() => rmSync(out, { recursive: true, force: true }));

describe.each([
	["sentinel", "api", "webhook", "webhookSecret"],
	["comlink", "src", "worker", "sentrySecret"],
])("exporting the %s requests", (app, folder, stem, secret) => {
	it("converts the real collection and environment with no issues and no pm.* left", async () => {
		out = mkdtempSync(join(tmpdir(), "bruno-e2e-"));
		const files = [`apps/${app}/${folder}/${stem}.collection.json`];
		const envFiles = [`apps/${app}/${folder}/${stem}.environment.json`];
		const result = await new BrunoTooling().export({
			collectionFiles: files,
			envFiles,
			outDir: out,
			repoRoot: REPO_ROOT,
		});
		expect(result).toEqual({ files: [`${stem}.bruno.json`], issues: [] });
		const text = readFileSync(join(out, `${stem}.bruno.json`), "utf8");
		const doc = JSON.parse(text) as Doc;

		// The scripts that sign each body ran on Postman's `pm` object; they are Bruno's own API now.
		expect(text).not.toMatch(/\bpm\./);
		expect(text).toContain("HmacSHA256");
		// The secret is read from the environment, by the name the environment declares (the text is JSON, so its quotes are escaped).
		expect(text).toContain(`bru.getEnvVar(\\"${secret}\\")`);
		expect(text).not.toContain("bru.getVar(");
		expect(text).toContain("req.setHeader(");

		// Every request of the source is still there, and the environment came with the collection, the secret marked.
		const source = JSON.parse(readFileSync(join(REPO_ROOT, files[0] as string), "utf8")) as {
			item: { name: string; item?: unknown[] }[];
		};
		const count = (items: { item?: unknown[] }[]): number =>
			items.reduce((n, entry) => n + (entry.item ? count(entry.item as { item?: unknown[] }[]) : 1), 0);
		expect(requests(doc.items)).toHaveLength(count(source.item));
		expect(doc.environments).toHaveLength(1);
		expect(doc.environments[0]?.variables.find((variable) => variable.name === secret)?.secret).toBe(true);
	});
});
