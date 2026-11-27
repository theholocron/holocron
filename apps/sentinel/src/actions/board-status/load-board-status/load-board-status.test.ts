import type { GitHubClient } from "@theholocron/github-client";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_BOARD_FACTORIES, loadBoardStatus } from "./load-board-status.js";
import type { BoardStatusEnv, BoardStatusFactories } from "./load-board-status.type.js";

const CLIENT = { graphql: {} } as unknown as GitHubClient;
const ENV: BoardStatusEnv = { SENTINEL_REPO: "acme/holocron" };
const PROJECTS = { providerName: "github" };

function factories(config: unknown, status = "valid"): BoardStatusFactories {
	return {
		validateConfig: vi.fn(async () =>
			status === "valid"
				? { status: "valid" as const, filepath: "holocron.config.ts", config: config as never }
				: ({ status } as never)
		),
		createProjects: vi.fn(() => PROJECTS as never),
	};
}

const github = (options: Record<string, unknown> = { boards: [{ template: "roadmap", name: "v5" }] }) => ({
	org: "acme",
	providers: { projects: ["github", options] },
});
const load = (env: BoardStatusEnv, f: BoardStatusFactories, repo = "acme/widgets") =>
	loadBoardStatus({ client: CLIENT, env, repo, factories: f });

describe("loadBoardStatus", () => {
	it("reads the configured repo's board declaration and builds the provider for the delivery's repo", async () => {
		const f = factories(github());
		const result = await load(ENV, f);
		expect(result).toMatchObject({ ok: true, owner: "acme", projects: PROJECTS });
		expect((result as { boards: { name: string; template: { name: string } }[] }).boards).toMatchObject([
			{ name: "v5", template: { name: "roadmap" } },
		]);
		expect(f.validateConfig).toHaveBeenCalledWith({ client: CLIENT, repo: "acme/holocron" });
		expect(f.createProjects).toHaveBeenCalledWith(CLIENT, "acme/widgets");
	});

	it("takes the owner from the option, else the config's org, else the repository's organisation", async () => {
		const own = await load(
			ENV,
			factories(github({ org: "elsewhere", boards: [{ template: "roadmap", name: "v5" }] }))
		);
		expect(own).toMatchObject({ ok: true, owner: "elsewhere" });
		const bare = await load(ENV, factories({ providers: github().providers }));
		expect(bare).toMatchObject({ ok: true, owner: "acme" });
	});

	it("is off, without reading anything, when the setting is missing or the organisation is another", async () => {
		const f = factories(github());
		expect(await load({}, f)).toEqual({
			ok: false,
			reason: "board status is off: SENTINEL_REPO is not set",
		});
		expect(await load(ENV, f, "other/widgets")).toMatchObject({
			ok: false,
			reason: expect.stringContaining("not for the other"),
		});
		expect(f.validateConfig).not.toHaveBeenCalled();
	});

	it("uses the real providers unless given others, and is off without the setting", async () => {
		expect(await loadBoardStatus({ client: CLIENT, env: {}, repo: "acme/widgets" })).toMatchObject({ ok: false });
	});

	it("says so when the config does not load or declares no usable projects provider", async () => {
		expect(await load(ENV, factories({}, "no-config"))).toEqual({
			ok: false,
			reason: "acme/holocron has no usable holocron config (no-config)",
		});
		expect(await load(ENV, factories({ providers: {} }))).toEqual({
			ok: false,
			reason: "acme/holocron declares no projects provider",
		});
		expect(await load(ENV, factories({ providers: { projects: "jira" } }))).toMatchObject({
			ok: false,
			reason: expect.stringContaining("jira"),
		});
		expect(await load(ENV, factories(github({ boards: "v5" })))).toMatchObject({
			ok: false,
			reason: expect.stringContaining("providers.projects is not valid"),
		});
	});

	it("leaves out a board whose template is not a built-in, and is off when none is left", async () => {
		const mixed = await load(
			ENV,
			factories(
				github({
					boards: [
						{ template: "mine", name: "private" },
						{ template: "sprint", name: "s1" },
					],
				})
			)
		);
		expect((mixed as { boards: { name: string }[] }).boards.map((b) => b.name)).toEqual(["s1"]);
		expect(await load(ENV, factories(github({ boards: [{ template: "mine", name: "private" }] })))).toEqual({
			ok: false,
			reason: "acme/holocron declares no board with a built-in template",
		});
		expect(await load(ENV, factories(github({})))).toMatchObject({ ok: false });
	});

	it("makes the real projects provider over the installation's own client", () => {
		const projects = DEFAULT_BOARD_FACTORIES.createProjects(CLIENT, "acme/widgets");
		expect(projects).toMatchObject({ key: "projects", providerName: "github" });
	});
});
