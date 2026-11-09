import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { placeAreas } from "@theholocron/cli";
import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { syncPropertiesFromConfig } from "./sync-properties.js";

/** `teams: ..., topics: ..., variables: ..., secrets: ...` as `holocron.config.ts` had it inline (a verbatim copy). */
const INLINE_REPO = fileURLToPath(
	new URL("../../../../../../cli/cli/src/config/load-config/repo-block.inline.fixture.txt", import.meta.url)
);
/** The file those keys moved to: this repo's own `.holocron/repo.ts`. */
const MOVED_REPO = fileURLToPath(new URL("../../../../../../.holocron/repo.ts", import.meta.url));

// What stays in the config: the keys the preset gives (`protection`, `properties`) and `defaultBranch`.
const kept = { protection: "strict", defaultBranch: "alpha", properties: { lifecycle: "active", open_source: true } };
const providers = { source: "github", ci: "github" };

async function run(config: Record<string, unknown>) {
	const { fetch, calls } = stubFetch([
		{ status: 404 }, // pnpm-workspace.yaml: not a monorepo
		{
			status: 200,
			body: { content: Buffer.from(JSON.stringify({ name: "demo", private: true })).toString("base64") },
		},
		{ status: 204 }, // setProperties
	]);
	const client = createGitHubClient({ token: "ghp_test", fetch });
	const result = await syncPropertiesFromConfig({ client, repo: "acme/demo", defaultBranch: "alpha", config });
	return { result, urls: calls.map((c) => `${c.method} ${c.url}`) };
}

describe("syncPropertiesFromConfig with the repo block in .holocron/repo.ts (#1787)", () => {
	it("sends the same properties for the old inline repo block and for the file's resolution", async () => {
		// The old inline text is a plain object body, so evaluating it as a literal gives what the config held.
		const inlineRepo = new Function(`return {${await readFile(INLINE_REPO, "utf8")}}`)() as Record<string, unknown>;
		const fromFile = (await import(MOVED_REPO)) as { default: Record<string, unknown> };

		const before = await run({ repo: { ...kept, ...inlineRepo }, providers });
		const placed = placeAreas(
			[{ area: "repo", path: ".holocron/repo.ts", value: fromFile.default }] as never,
			{
				repo: kept,
				providers,
			} as never
		);
		const after = await run(placed as unknown as Record<string, unknown>);

		expect(after.result).toEqual(before.result);
		expect(after.urls).toEqual(before.urls);
		// Guard against a vacuous pass: the block really moved, and the properties were really sent.
		expect((placed.repo as Record<string, unknown>).teams).toEqual(inlineRepo.teams);
		expect(Object.keys(inlineRepo)).toEqual(["teams", "topics", "variables", "secrets"]);
		expect(before.result.properties).toMatchObject({
			holocron_branch_protection_level: "strict",
			lifecycle: "active",
		});
	});
});
