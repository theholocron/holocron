import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BrunoTooling } from "./capabilities/tooling.js";
import { comparableDocs, readDocs } from "./workspace-docs.js";

/** This repository's root: its real request files and its committed `.bruno/` workspace are compared, not copies. */
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** The `secretRefs` of the root `holocron.config.ts`. */
const SECRET_REFS = { webhookSecret: "SENTINEL_WEBHOOK_SECRET", sentrySecret: "COMLINK_SENTRY_SECRET" };

describe("the committed .bruno/ workspace", () => {
	it("refers each signing secret to its 1Password entry, and the request files keep it blank", () => {
		const read = (path: string) => readFileSync(join(REPO_ROOT, path), "utf8");
		for (const env of ["local", "dev", "prod"]) {
			expect(read(`.bruno/collections/sentinel-webhook/environments/Sentinel (${env}).yml`)).toContain(
				'name: webhookSecret\n    value: "{{process.env.SENTINEL_WEBHOOK_SECRET}}"'
			);
		}
		expect(read(".bruno/collections/comlink-relay/environments/Comlink (local).yml")).toContain(
			'name: sentrySecret\n    value: "{{process.env.COMLINK_SENTRY_SECRET}}"'
		);
		for (const file of [
			"apps/sentinel/api/webhook.environment.json",
			"apps/sentinel/api/webhook.environment.dev.json",
			"apps/sentinel/api/webhook.environment.prod.json",
			"apps/comlink/src/worker.environment.json",
		]) {
			expect(read(file)).not.toContain("process.env");
		}
	});

	it("is what the repo's request files generate, so `holocron sync requests` has nothing to write", async () => {
		const result = await new BrunoTooling({
			repoRoot: REPO_ROOT,
			workspaceName: "The Holocron",
			secretRefs: SECRET_REFS,
		}).workspace({
			collectionFiles: ["apps/sentinel/api/webhook.collection.json", "apps/comlink/src/worker.collection.json"],
			envFiles: [
				"apps/sentinel/api/webhook.environment.json",
				"apps/sentinel/api/webhook.environment.dev.json",
				"apps/sentinel/api/webhook.environment.prod.json",
				"apps/comlink/src/worker.environment.json",
			],
			repoRoot: REPO_ROOT,
			dryRun: true,
		});
		const stale = result.files
			.filter((file) => file.state !== "unchanged")
			.map((file) => `${file.state} ${file.path}`);
		expect(stale, "run `pnpm exec holocron sync requests --yes` and commit .bruno/").toEqual([]);
		expect(result.files.length).toBeGreaterThan(0);
	});

	it("gives each collection an info.version, which no check compares, so a release leaves it behind harmlessly", () => {
		for (const folder of ["sentinel-webhook", "comlink-relay"]) {
			const text = readFileSync(join(REPO_ROOT, `.bruno/collections/${folder}/opencollection.yml`), "utf8");
			expect(text).toMatch(/^info:\n {2}name: .+\n {2}version: ".+"\n/m);
		}
	});

	it("keeps the docs of workspace.yml and .bruno/README.md as the same text, and records the pair", () => {
		const readme = readFileSync(join(REPO_ROOT, ".bruno/README.md"), "utf8");
		const docs = readDocs(readFileSync(join(REPO_ROOT, ".bruno/workspace.yml"), "utf8"));
		expect(docs).toBeTruthy();
		// The same text up to a table's padding, which a formatter may add to the README and Bruno does not.
		expect(comparableDocs(readme)).toBe(comparableDocs(docs as string));
		expect(readme.endsWith("\n")).toBe(true);
		const baseline = JSON.parse(readFileSync(join(REPO_ROOT, ".bruno/.sync.json"), "utf8")) as {
			pairs: { kind: string; source: string; workspace: string; sourceHash: string; workspaceHash: string }[];
		};
		const pair = baseline.pairs.find((p) => p.kind === "docs");
		expect(pair).toMatchObject({ source: ".bruno/README.md", workspace: "workspace.yml" });
		expect(pair?.sourceHash).toBe(
			createHash("sha256")
				.update(comparableDocs(docs as string))
				.digest("hex")
		);
		expect(pair?.workspaceHash).toBe(pair?.sourceHash);
	});
});
