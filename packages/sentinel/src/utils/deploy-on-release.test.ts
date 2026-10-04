import { describe, expect, it, vi } from "vitest";

import {
	createPlugin,
	defaultPaths,
	type ReleaseContext,
	shouldDeploy,
	waitForPublished,
	workspaceDependencies,
} from "../../scripts/deploy-on-release.mjs";

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

/**
 * A fake runner: `git diff` returns `changed`, `npm view name@version` returns
 * that version once `served` (or fails, like an unpublished package), and the
 * deploy exits `deployStatus`.
 */
function fakeRun({
	changed = ["packages/sentinel/src/handler.ts"],
	diffStatus = 0,
	deployStatus = 0,
	served = true,
} = {}) {
	return vi.fn((command: string, args: string[]) => {
		if (command === "git") {
			return {
				status: diffStatus,
				stdout: changed.map((f) => `${f}\n`).join(""),
				stderr: diffStatus ? "bad revision" : "",
			};
		}
		if (command === "npm") {
			const spec = args[1] ?? "";
			const version = spec.slice(spec.lastIndexOf("@") + 1);
			return served
				? { status: 0, stdout: `${version}\n`, stderr: "" }
				: { status: 1, stdout: "", stderr: "E404 not found" };
		}
		return { status: deployStatus, stdout: "", stderr: "" };
	});
}

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

const VERSION = "5.0.0-alpha.105";

const TREE = fakeTree(
	{
		"/repo/packages/sentinel/package.json": {
			name: "@theholocron/sentinel",
			dependencies: { "@theholocron/cli": "workspace:*", "@theholocron/datapad": "workspace:^", yaml: "2.9.0" },
		},
		"/repo/packages/cli/package.json": { name: "@theholocron/cli", version: VERSION },
		"/repo/packages/datapad/package.json": { name: "@theholocron/datapad", version: VERSION },
		"/repo/packages/astromech/package.json": { name: "@theholocron/astromech", version: VERSION },
	},
	["sentinel", "cli", "datapad", "astromech", "no-manifest"]
);

/** A clock the test drives: `sleep` advances `now` instead of waiting. */
function fakeClock() {
	let t = 0;
	return {
		now: () => t,
		sleep: vi.fn((ms: number) => {
			t += ms;
			return Promise.resolve();
		}),
	};
}

/** The plugin over the fake tree and clock, so nothing touches git, npm, pnpm, disk or time. */
function plugin(run: ReturnType<typeof fakeRun>, clock = fakeClock()) {
	return createPlugin({ run, sentinelDir: "/repo/packages/sentinel", ...TREE, ...clock });
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
	it("diffs the release's commits, waits for npm, then runs Sentinel's own deploy with the release's env", async () => {
		const run = fakeRun();
		const ctx = context();

		await plugin(run).success(CONFIG, ctx);

		expect(run.mock.calls.map(([command]) => command)).toEqual(["git", "npm", "npm", "pnpm"]);
		expect(run).toHaveBeenNthCalledWith(1, "git", ["diff", "--name-only", "old", "new"], { cwd: "/repo" });
		expect(run).toHaveBeenCalledWith("pnpm", ["--filter", "@theholocron/sentinel", "delivery.deploy"], {
			cwd: "/repo",
			env: ctx.env,
			stdio: "inherit",
		});
		expect(ctx.logger.success).toHaveBeenCalledWith("deploy-on-release: Sentinel deployed.");
	});

	it("waits for npm to serve the release's workspace packages before deploying", async () => {
		const run = fakeRun();
		const ctx = context();

		await plugin(run).success(CONFIG, ctx);

		expect(run).toHaveBeenCalledWith("npm", ["view", `@theholocron/cli@${VERSION}`, "version", "--prefer-online"], {
			cwd: "/repo",
		});
		expect(run).toHaveBeenCalledWith(
			"npm",
			["view", `@theholocron/datapad@${VERSION}`, "version", "--prefer-online"],
			{ cwd: "/repo" }
		);
		expect(ctx.logger.log).toHaveBeenCalledWith(
			`deploy-on-release: waiting for npm to serve @theholocron/cli@${VERSION}, @theholocron/datapad@${VERSION}.`
		);
	});

	it("skips, saying so, and never deploys when npm still doesn't serve the versions after the timeout", async () => {
		const run = fakeRun({ served: false });
		const clock = fakeClock();
		const ctx = context();

		await plugin(run, clock).success(CONFIG, ctx);

		expect(run).not.toHaveBeenCalledWith("pnpm", expect.anything(), expect.anything());
		expect(clock.sleep).toHaveBeenCalled();
		expect(ctx.logger.error).toHaveBeenCalledWith(
			expect.stringContaining(
				`npm still doesn't serve @theholocron/cli@${VERSION}, @theholocron/datapad@${VERSION}`
			)
		);
	});

	it("never throws when the deploy fails -- the release already published", async () => {
		const ctx = context();

		await expect(plugin(fakeRun({ deployStatus: 1 })).success(CONFIG, ctx)).resolves.toBeUndefined();
		expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining("the Sentinel deploy failed (exit 1)"));
	});

	it("skips, logging why, when the release doesn't touch Sentinel", async () => {
		const run = fakeRun({ changed: ["docs/x.md"] });
		const ctx = context();

		await plugin(run).success(CONFIG, ctx);

		expect(run).toHaveBeenCalledOnce(); // the diff only: no npm wait, no deploy
		expect(ctx.logger.log).toHaveBeenCalledWith(expect.stringContaining("skipping the Sentinel deploy"));
	});

	it("skips a stable (default-channel) release without running git, npm or pnpm", async () => {
		const run = fakeRun();
		const ctx = context({ branch: { channel: null }, nextRelease: { gitHead: "new", channel: null } });

		await plugin(run).success(CONFIG, ctx);

		expect(run).not.toHaveBeenCalled();
		expect(ctx.logger.log).toHaveBeenCalledWith(expect.stringContaining('channel "default"'));
	});

	it("falls back to the branch's channel when the release doesn't name one", async () => {
		const run = fakeRun();
		await plugin(run).success(CONFIG, context({ nextRelease: { gitHead: "new" } }));
		expect(run).toHaveBeenCalledWith("pnpm", expect.anything(), expect.anything());
	});

	it("deploys a first release with nothing to diff against, without running git", async () => {
		const run = fakeRun();
		await plugin(run).success(CONFIG, context({ lastRelease: {} }));
		expect(run).not.toHaveBeenCalledWith("git", expect.anything(), expect.anything());
		expect(run).toHaveBeenCalledWith("pnpm", expect.anything(), expect.anything());
	});

	it("skips, without deploying, when the diff itself fails", async () => {
		const run = fakeRun({ diffStatus: 128 });
		const ctx = context();

		await plugin(run).success(CONFIG, ctx);

		expect(run).toHaveBeenCalledOnce();
		expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining("git diff failed: bad revision"));
	});

	it("skips, saying so, when VERCEL_TOKEN is missing", async () => {
		const run = fakeRun();
		const ctx = context({ env: {} });

		await plugin(run).success(CONFIG, ctx);

		expect(run).not.toHaveBeenCalledWith("pnpm", expect.anything(), expect.anything());
		expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining("VERCEL_TOKEN isn't set"));
	});
});

describe("waitForPublished", () => {
	const PACKAGES = [
		{ name: "@theholocron/cli", version: VERSION },
		{ name: "@theholocron/datapad", version: VERSION },
	];

	it("returns at once, without sleeping, when npm already serves every version", async () => {
		const clock = fakeClock();

		const pending = await waitForPublished({ packages: PACKAGES, run: fakeRun(), ...clock });

		expect(pending).toEqual([]);
		expect(clock.sleep).not.toHaveBeenCalled();
	});

	it("polls until a version npm didn't serve at first shows up, asking only about what's still missing", async () => {
		const clock = fakeClock();
		let cliAsked = 0;
		const run = vi.fn((_command: string, args: string[]) => {
			const spec = args[1] ?? "";
			const served = !spec.includes("/cli@") || ++cliAsked >= 3;
			return served
				? { status: 0, stdout: `${VERSION}\n`, stderr: "" }
				: { status: 1, stdout: "", stderr: "E404" };
		});

		const pending = await waitForPublished({ packages: PACKAGES, run, ...clock, intervalMs: 10_000 });

		expect(pending).toEqual([]);
		expect(clock.sleep).toHaveBeenCalledTimes(2);
		// datapad was served on the first round, so only cli is asked about after it.
		const datapadAsks = run.mock.calls.filter(([, args]) => args[1]?.includes("/datapad@")).length;
		expect(datapadAsks).toBe(1);
	});

	it("treats a different version from npm as not yet served", async () => {
		const run = vi.fn(() => ({ status: 0, stdout: "5.0.0-alpha.104\n", stderr: "" }));

		const pending = await waitForPublished({
			packages: [{ name: "@theholocron/cli", version: VERSION }],
			run,
			...fakeClock(),
			timeoutMs: 20_000,
			intervalMs: 10_000,
		});

		expect(pending).toEqual([`@theholocron/cli@${VERSION}`]);
	});

	it("gives up after the timeout, returning what's still missing", async () => {
		const clock = fakeClock();

		const pending = await waitForPublished({
			packages: PACKAGES,
			run: fakeRun({ served: false }),
			...clock,
			timeoutMs: 30_000,
			intervalMs: 10_000,
		});

		expect(pending).toEqual([`@theholocron/cli@${VERSION}`, `@theholocron/datapad@${VERSION}`]);
		expect(clock.sleep).toHaveBeenCalledTimes(3);
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

describe("workspaceDependencies", () => {
	it("lists each workspace:* dependency with its folder and version, skipping npm dependencies and unrelated packages", () => {
		expect(workspaceDependencies({ repoRoot: "/repo", sentinelDir: "/repo/packages/sentinel", ...TREE })).toEqual([
			{ name: "@theholocron/cli", dir: "/repo/packages/cli", version: VERSION },
			{ name: "@theholocron/datapad", dir: "/repo/packages/datapad", version: VERSION },
		]);
	});
});

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
	it("deploys an alpha release touching a derived path when the plugin is configured with no options", async () => {
		const run = fakeRun({ changed: ["packages/datapad/src/load.ts"] });
		const ctx = context();

		await plugin(run).success({}, ctx);

		expect(run).toHaveBeenCalledWith("pnpm", expect.anything(), expect.anything());
		expect(ctx.logger.log).toHaveBeenCalledWith(expect.stringContaining("packages/datapad/src/load.ts"));
	});

	it("skips a release touching only a workspace package Sentinel doesn't depend on", async () => {
		const run = fakeRun({ changed: ["packages/astromech/src/x.ts"] });
		await plugin(run).success({}, context());
		expect(run).not.toHaveBeenCalledWith("pnpm", expect.anything(), expect.anything());
	});

	it("lets explicit options override both defaults", async () => {
		const run = fakeRun({ changed: ["docs/x.md"] });
		const ctx = context({ branch: { channel: "beta" }, nextRelease: { gitHead: "new", channel: "beta" } });

		await plugin(run).success({ channel: "beta", paths: ["docs/"] }, ctx);

		expect(run).toHaveBeenCalledWith("pnpm", expect.anything(), expect.anything());
	});

	it("skips, logging why, when Sentinel's package.json can't be read to derive the paths", async () => {
		const run = fakeRun();
		const ctx = context();

		await createPlugin({ run, sentinelDir: "/elsewhere", ...TREE }).success({}, ctx);

		expect(run).not.toHaveBeenCalled();
		expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining("couldn't decide whether to deploy"));
	});

	it("skips, logging why, when it can't check npm for the release's versions", async () => {
		const run = fakeRun();
		const ctx = context();
		const unreadableAfterDiff = vi
			.fn()
			.mockImplementationOnce(TREE.readJson)
			.mockImplementationOnce(TREE.readJson)
			.mockImplementationOnce(TREE.readJson)
			.mockImplementationOnce(TREE.readJson)
			.mockImplementation(() => {
				throw new Error("EIO");
			});

		await createPlugin({
			run,
			sentinelDir: "/repo/packages/sentinel",
			readJson: unreadableAfterDiff,
			listDirs: TREE.listDirs,
			...fakeClock(),
		}).success({}, ctx);

		expect(run).not.toHaveBeenCalledWith("pnpm", expect.anything(), expect.anything());
		expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining("couldn't check npm"));
	});

	it("warns on the default alpha channel when VERCEL_TOKEN is missing", () => {
		const ctx = context({ env: {} });
		createPlugin().verifyConditions({}, ctx);
		expect(ctx.logger.warn).toHaveBeenCalledWith(expect.stringContaining('a release on "alpha"'));
	});
});
