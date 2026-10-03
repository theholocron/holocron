import { describe, expect, it, vi } from "vitest";

import { createPlugin, defaultPaths, type ReleaseContext, shouldDeploy } from "../../scripts/deploy-on-release.mjs";

const CONFIG = { channel: "alpha", paths: ["packages/sentinel/", "packages/cli/"] };

function context(overrides: Partial<ReleaseContext> = {}): ReleaseContext {
	return {
		cwd: "/repo",
		env: { VERCEL_TOKEN: "vt" },
		logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
		branch: { channel: "alpha" },
		lastRelease: { gitHead: "old" },
		nextRelease: { gitHead: "new", channel: "alpha" },
		...overrides,
	};
}

/** A fake runner: `git diff` returns `changed`, the deploy exits `deployStatus`. */
function fakeRun({ changed = ["packages/sentinel/src/handler.ts"], diffStatus = 0, deployStatus = 0 } = {}) {
	return vi.fn((command: string) =>
		command === "git"
			? {
					status: diffStatus,
					stdout: changed.map((f) => `${f}\n`).join(""),
					stderr: diffStatus ? "bad revision" : "",
				}
			: { status: deployStatus, stdout: "", stderr: "" }
	);
}

describe("shouldDeploy (holocron#928)", () => {
	it("deploys a release on the configured channel that touches a configured path", () => {
		expect(
			shouldDeploy({
				channel: "alpha",
				configuredChannel: "alpha",
				changedFiles: ["packages/cli/src/x.ts"],
				paths: CONFIG.paths,
			})
		).toEqual({ deploy: true, reason: "the release changes packages/cli/src/x.ts" });
	});

	it("skips another channel, including the default (stable) one", () => {
		expect(shouldDeploy({ channel: undefined, configuredChannel: "alpha", changedFiles: [], paths: [] })).toEqual({
			deploy: false,
			reason: 'channel "default" isn\'t "alpha"',
		});
		expect(shouldDeploy({ channel: "beta", configuredChannel: "alpha", changedFiles: [], paths: [] }).deploy).toBe(
			false
		);
	});

	it("skips a release that touches none of the paths", () => {
		expect(
			shouldDeploy({
				channel: "alpha",
				configuredChannel: "alpha",
				changedFiles: ["docs/x.md"],
				paths: CONFIG.paths,
			})
		).toEqual({ deploy: false, reason: "the release changes nothing under packages/sentinel/, packages/cli/" });
	});

	it("deploys when there's no previous release to diff against", () => {
		expect(
			shouldDeploy({ channel: "alpha", configuredChannel: "alpha", changedFiles: undefined, paths: CONFIG.paths })
				.deploy
		).toBe(true);
	});
});

describe("deploy-on-release success hook", () => {
	it("diffs the release's commits, then runs Sentinel's own deploy with the release's env", () => {
		const run = fakeRun();
		const ctx = context();

		createPlugin({ run }).success(CONFIG, ctx);

		expect(run).toHaveBeenNthCalledWith(1, "git", ["diff", "--name-only", "old", "new"], { cwd: "/repo" });
		expect(run).toHaveBeenNthCalledWith(2, "pnpm", ["--filter", "@theholocron/sentinel", "delivery.deploy"], {
			cwd: "/repo",
			env: ctx.env,
			stdio: "inherit",
		});
		expect(ctx.logger.success).toHaveBeenCalledWith("deploy-on-release: Sentinel deployed.");
	});

	it("never throws when the deploy fails -- the release already published", () => {
		const ctx = context();

		expect(() => createPlugin({ run: fakeRun({ deployStatus: 1 }) }).success(CONFIG, ctx)).not.toThrow();
		expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining("the Sentinel deploy failed (exit 1)"));
	});

	it("skips, logging why, when the release doesn't touch Sentinel", () => {
		const run = fakeRun({ changed: ["docs/x.md"] });
		const ctx = context();

		createPlugin({ run }).success(CONFIG, ctx);

		expect(run).toHaveBeenCalledOnce(); // the diff only
		expect(ctx.logger.log).toHaveBeenCalledWith(expect.stringContaining("skipping the Sentinel deploy"));
	});

	it("skips a stable (default-channel) release without running git or pnpm", () => {
		const run = fakeRun();
		const ctx = context({ branch: { channel: null }, nextRelease: { gitHead: "new", channel: null } });

		createPlugin({ run }).success(CONFIG, ctx);

		expect(run).not.toHaveBeenCalled();
		expect(ctx.logger.log).toHaveBeenCalledWith(expect.stringContaining('channel "default"'));
	});

	it("falls back to the branch's channel when the release doesn't name one", () => {
		const run = fakeRun();
		createPlugin({ run }).success(CONFIG, context({ nextRelease: { gitHead: "new" } }));
		expect(run).toHaveBeenCalledWith("pnpm", expect.anything(), expect.anything());
	});

	it("deploys a first release with nothing to diff against, without running git", () => {
		const run = fakeRun();
		createPlugin({ run }).success(CONFIG, context({ lastRelease: {} }));
		expect(run).toHaveBeenCalledExactlyOnceWith("pnpm", expect.anything(), expect.anything());
	});

	it("skips, without deploying, when the diff itself fails", () => {
		const run = fakeRun({ diffStatus: 128 });
		const ctx = context();

		createPlugin({ run }).success(CONFIG, ctx);

		expect(run).toHaveBeenCalledOnce();
		expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining("git diff failed: bad revision"));
	});

	it("skips, saying so, when VERCEL_TOKEN is missing", () => {
		const run = fakeRun();
		const ctx = context({ env: {} });

		createPlugin({ run }).success(CONFIG, ctx);

		expect(run).not.toHaveBeenCalledWith("pnpm", expect.anything(), expect.anything());
		expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining("VERCEL_TOKEN isn't set"));
	});
});

describe("deploy-on-release verifyConditions hook", () => {
	it("warns before publishing when a deploying channel has no VERCEL_TOKEN", () => {
		const ctx = context({ env: {} });
		createPlugin().verifyConditions(CONFIG, ctx);
		expect(ctx.logger.warn).toHaveBeenCalledWith(expect.stringContaining("VERCEL_TOKEN isn't set"));
	});

	it("stays quiet with a token, or on a channel that doesn't deploy", () => {
		const withToken = context();
		createPlugin().verifyConditions(CONFIG, withToken);
		const otherChannel = context({
			env: {},
			branch: { channel: "beta" },
			nextRelease: { gitHead: "new", channel: "beta" },
		});
		createPlugin().verifyConditions(CONFIG, otherChannel);
		expect(withToken.logger.warn).not.toHaveBeenCalled();
		expect(otherChannel.logger.warn).not.toHaveBeenCalled();
	});
});

/** A fake repo: package.json bodies by path, and the packages/ folder listing. */
function fakeTree(files: Record<string, unknown>, dirs: string[]) {
	return {
		readJson: (path: string) => {
			if (!(path in files)) throw new Error(`ENOENT: ${path}`);
			return files[path];
		},
		listDirs: () => dirs,
	};
}

const TREE = fakeTree(
	{
		"/repo/packages/sentinel/package.json": {
			name: "@theholocron/sentinel",
			dependencies: { "@theholocron/cli": "workspace:*", "@theholocron/datapad": "workspace:^", yaml: "2.9.0" },
		},
		"/repo/packages/cli/package.json": { name: "@theholocron/cli" },
		"/repo/packages/datapad/package.json": { name: "@theholocron/datapad" },
		"/repo/packages/astromech/package.json": { name: "@theholocron/astromech" },
	},
	["sentinel", "cli", "datapad", "astromech", "no-manifest"]
);

describe("defaultPaths (holocron#928)", () => {
	it("is Sentinel plus the folder of each workspace:* dependency, matched by package name", () => {
		expect(defaultPaths({ repoRoot: "/repo", sentinelDir: "/repo/packages/sentinel", ...TREE })).toEqual([
			"packages/sentinel/",
			"packages/cli/",
			"packages/datapad/",
		]);
	});

	it("is just Sentinel when it has no workspace dependencies", () => {
		const tree = fakeTree({ "/repo/packages/sentinel/package.json": { name: "s" } }, ["sentinel"]);
		expect(defaultPaths({ repoRoot: "/repo", sentinelDir: "/repo/packages/sentinel", ...tree })).toEqual([
			"packages/sentinel/",
		]);
	});
});

describe("deploy-on-release defaults", () => {
	it("deploys an alpha release touching a derived path when the plugin is configured with no options", () => {
		const run = fakeRun({ changed: ["packages/datapad/src/load.ts"] });
		const ctx = context();

		createPlugin({ run, sentinelDir: "/repo/packages/sentinel", ...TREE }).success({}, ctx);

		expect(run).toHaveBeenCalledWith("pnpm", expect.anything(), expect.anything());
		expect(ctx.logger.log).toHaveBeenCalledWith(expect.stringContaining("packages/datapad/src/load.ts"));
	});

	it("skips a release touching only a workspace package Sentinel doesn't depend on", () => {
		const run = fakeRun({ changed: ["packages/astromech/src/x.ts"] });
		createPlugin({ run, sentinelDir: "/repo/packages/sentinel", ...TREE }).success({}, context());
		expect(run).not.toHaveBeenCalledWith("pnpm", expect.anything(), expect.anything());
	});

	it("lets explicit options override both defaults", () => {
		const run = fakeRun({ changed: ["docs/x.md"] });
		const ctx = context({ branch: { channel: "beta" }, nextRelease: { gitHead: "new", channel: "beta" } });

		createPlugin({ run, sentinelDir: "/repo/packages/sentinel", ...TREE }).success(
			{ channel: "beta", paths: ["docs/"] },
			ctx
		);

		expect(run).toHaveBeenCalledWith("pnpm", expect.anything(), expect.anything());
	});

	it("skips, logging why, when Sentinel's package.json can't be read to derive the paths", () => {
		const run = fakeRun();
		const ctx = context();

		createPlugin({ run, sentinelDir: "/elsewhere", ...TREE }).success({}, ctx);

		expect(run).not.toHaveBeenCalled();
		expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining("couldn't decide whether to deploy"));
	});

	it("warns on the default alpha channel when VERCEL_TOKEN is missing", () => {
		const ctx = context({ env: {} });
		createPlugin().verifyConditions({}, ctx);
		expect(ctx.logger.warn).toHaveBeenCalledWith(expect.stringContaining('a release on "alpha"'));
	});
});
