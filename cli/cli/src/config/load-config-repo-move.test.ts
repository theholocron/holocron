import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "./config-system.js";

/** The `repo` keys exactly as `holocron.config.ts` had them inline before #1787 (a verbatim copy of the old text). */
const INLINE_REPO = new URL("./repo-block.inline.fixture.txt", import.meta.url);
/** The file those keys moved to: this repo's own `.holocron/repo.ts`. */
const MOVED_REPO = fileURLToPath(new URL("../../../../.holocron/repo.ts", import.meta.url));

/** What stays in the config: `defaultBranch` (and, here standing in for the preset, `protection`). */
const STAYS = `defaultBranch: "alpha", protection: "strict"`;
const base = (inlineRepo: string) =>
	`export default {
	name: "demo",
	providers: { source: "github" },
	repo: { ${STAYS},
${inlineRepo}
	},
};
`;

describe("the repo block moved to .holocron/repo.ts (#1787)", () => {
	let inline: string;
	let moved: string;

	beforeEach(async () => {
		inline = await mkdtemp(join(tmpdir(), "holocron-repo-inline-"));
		moved = await mkdtemp(join(tmpdir(), "holocron-repo-moved-"));
	});
	afterEach(async () => {
		await rm(inline, { recursive: true, force: true });
		await rm(moved, { recursive: true, force: true });
	});

	it("resolves to the same repo settings as the old inline text", async () => {
		await writeFile(join(inline, "holocron.config.ts"), base(await readFile(INLINE_REPO, "utf8")));
		await writeFile(join(moved, "holocron.config.ts"), base(""));
		await mkdir(join(moved, ".holocron"));
		await copyFile(MOVED_REPO, join(moved, ".holocron", "repo.ts"));

		const before = (await loadConfig(inline)).resolved.repo;
		const after = (await loadConfig(moved)).resolved.repo;

		// `variables` is the one deliberate difference since the move (#1817): the old inline text had literal values,
		// the file now names the keys of a 1Password Environment. Everything else must match.
		expect(after?.variables?.sync).toEqual([
			{
				environment: "Holocron - GitHub Actions variables",
				scope: "org=theholocron",
				keys: [
					"AXIOM_DATASET",
					"CLOUDFLARE_ACCOUNT_ID",
					"CLOUDFLARE_PAGES_PROJECT",
					"POSTHOG_PROJECT_TOKEN",
					"TURBO_TEAM",
				],
			},
		]);
		expect(after?.variables).not.toHaveProperty("org");
		const { variables: _movedVariables, ...afterRest } = after!;
		const { variables: _inlineVariables, ...beforeRest } = before!;
		expect(afterRest).toEqual(beforeRest);
		// Guard against a vacuous pass: the moved keys are really there on both sides, and the kept ones too.
		expect(before).toMatchObject({
			defaultBranch: "alpha",
			protection: "strict",
			teams: [{ slug: "gatekeepers", permission: "maintain" }],
			topics: expect.arrayContaining(["holocron"]),
			variables: { org: { TURBO_TEAM: "iamnewton" } }, // the old inline text
			secrets: {
				sync: expect.arrayContaining([expect.objectContaining({ environment: "Holocron - GitHub Actions" })]),
			},
		});
	});

	it("refuses a key set both in the config and in the file", async () => {
		await writeFile(join(moved, "holocron.config.ts"), base(`topics: ["x"],`));
		await mkdir(join(moved, ".holocron"));
		await copyFile(MOVED_REPO, join(moved, ".holocron", "repo.ts"));

		await expect(loadConfig(moved)).rejects.toThrow(/repo\.topics is set in the config and in/);
	});

	it("keeps no secret value in the file: every secret entry is a name", async () => {
		const text = await readFile(MOVED_REPO, "utf8");
		const keys = [...text.matchAll(/^\s+"([A-Z][A-Z0-9_]+)",$/gm)].map((m) => m[1]);
		expect(keys.length).toBeGreaterThan(20);
		for (const key of keys) expect(key).toMatch(/^[A-Z][A-Z0-9_]*$/);
	});
});
