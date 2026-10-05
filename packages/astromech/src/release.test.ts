import { describe, expect, it, vi } from "vitest";

import type { TasksConfig } from "./config/schema.js";
import {
	createPlugin,
	defaultPaths,
	deployTargets,
	type ReleaseContext,
	type Run,
	shouldDeploy,
	waitForPublished,
	workspaceDependencies,
	workspacePackages,
} from "./release.js";

const VERSION = "5.0.0-alpha.105";
const PATHS = ["packages/app/", "packages/cli/"];

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
function fakeRun({ changed = ["packages/app/src/handler.ts"], diffStatus = 0, deployStatus = 0, served = true } = {}) {
	return vi.fn<Run>((command, args) => {
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

const FILES: Record<string, unknown> = {
	"/repo/packages/app/package.json": {
		name: "@theholocron/app",
		version: "1.0.0",
		dependencies: { "@theholocron/cli": "workspace:*", "@theholocron/datapad": "workspace:^", yaml: "2.9.0" },
	},
	"/repo/packages/cli/package.json": { name: "@theholocron/cli", version: VERSION },
	"/repo/packages/datapad/package.json": { name: "@theholocron/datapad", version: VERSION },
	"/repo/packages/astromech/package.json": { name: "@theholocron/astromech", version: VERSION },
};
const DIRS = ["app", "cli", "datapad", "astromech", "no-manifest"];
const TREE = {
	readJson: (path: string) => {
		if (!(path in FILES)) throw new Error(`ENOENT: ${path}`);
		return FILES[path];
	},
	listDirs: () => DIRS,
};

const APP_DEPLOY: TasksConfig = {
	tasks: [{ name: "delivery.deploy", with: { on: "release", channel: "alpha", requires: ["VERCEL_TOKEN"] } }],
};

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
function plugin(
	run: ReturnType<typeof fakeRun>,
	manifests: Record<string, TasksConfig> = { "/repo/packages/app": APP_DEPLOY },
	clock = fakeClock()
) {
	return createPlugin({
		run,
		...TREE,
		...clock,
		loadTasks: (dir) => Promise.resolve(manifests[dir] ?? {}),
	});
}

describe("shouldDeploy", () => {
	it("deploys a release on the configured channel that touches a configured path", () => {
		expect(
			shouldDeploy({
				channel: "alpha",
				configuredChannel: "alpha",
				changedFiles: ["packages/cli/src/x.ts"],
				paths: PATHS,
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
			shouldDeploy({ channel: "alpha", configuredChannel: "alpha", changedFiles: ["docs/x.md"], paths: PATHS })
		).toEqual({ deploy: false, reason: "the release changes nothing under packages/app/, packages/cli/" });
	});

	it("deploys when there's no previous release to diff against", () => {
		expect(
			shouldDeploy({ channel: "alpha", configuredChannel: "alpha", changedFiles: undefined, paths: PATHS }).deploy
		).toBe(true);
	});
});

describe("workspace discovery", () => {
	const all = workspacePackages("/repo", TREE);

	it("lists the packages with a readable named package.json, skipping folders without one", () => {
		expect(all.map((p) => p.name)).toEqual([
			"@theholocron/app",
			"@theholocron/cli",
			"@theholocron/datapad",
			"@theholocron/astromech",
		]);
	});

	it("skips a package.json with no name", () => {
		const tree = { readJson: () => ({ version: "1" }), listDirs: () => ["x"] };
		expect(workspacePackages("/repo", tree)).toEqual([]);
	});

	it("finds each workspace:* dependency, skipping npm dependencies and unrelated packages", () => {
		const [app] = all as [(typeof all)[number]];
		expect(workspaceDependencies(app, all).map((d) => [d.name, d.version])).toEqual([
			["@theholocron/cli", VERSION],
			["@theholocron/datapad", VERSION],
		]);
	});

	it("derives paths: the package plus each workspace dependency's folder", () => {
		const [app] = all as [(typeof all)[number]];
		expect(defaultPaths("/repo", app, all)).toEqual(["packages/app/", "packages/cli/", "packages/datapad/"]);
	});

	it("derives just the package's folder when it has no workspace dependencies", () => {
		const cli = all[1] as (typeof all)[number];
		expect(defaultPaths("/repo", cli, all)).toEqual(["packages/cli/"]);
	});
});

describe("deployTargets", () => {
	const all = workspacePackages("/repo", TREE);
	const manifest = (tasks: TasksConfig["tasks"]) => new Map([["/repo/packages/app", { tasks }]]);

	it("picks only delivery.deploy tasks with on: release, resolving their options", () => {
		const targets = deployTargets(
			all,
			manifest([
				"verification.unitTests",
				{ name: "delivery.deploy", with: { on: "push" } },
				{
					name: "delivery.deploy",
					with: { on: "release", channel: "beta", paths: ["docs/"], requires: ["TOKEN"] },
				},
			])
		);
		expect(targets).toEqual([
			{
				pkg: expect.objectContaining({ name: "@theholocron/app" }),
				channel: "beta",
				paths: ["docs/"],
				requires: ["TOKEN"],
			},
		]);
	});

	it("defaults the channel to alpha, with no explicit paths or requirements", () => {
		const [target] = deployTargets(all, manifest([{ name: "delivery.deploy", with: { on: "release" } }]));
		expect(target).toMatchObject({ channel: "alpha", paths: undefined, requires: [] });
	});

	it("ignores a bare delivery.deploy and packages with no manifest", () => {
		expect(deployTargets(all, manifest(["delivery.deploy"]))).toEqual([]);
		expect(deployTargets(all, new Map())).toEqual([]);
	});
});

describe("success hook", () => {
	it("diffs the release's commits, waits for npm, then runs the package's own deploy with the release's env", async () => {
		const run = fakeRun();
		const ctx = context();

		await plugin(run).success(undefined, ctx);

		expect(run.mock.calls.map(([command]) => command)).toEqual(["git", "npm", "npm", "pnpm"]);
		expect(run).toHaveBeenNthCalledWith(1, "git", ["diff", "--name-only", "old", "new"], { cwd: "/repo" });
		expect(run).toHaveBeenCalledWith("pnpm", ["--filter", "@theholocron/app", "delivery.deploy"], {
			cwd: "/repo",
			env: ctx.env,
			stdio: "inherit",
		});
		expect(ctx.logger.success).toHaveBeenCalledWith("deploy-on-release (@theholocron/app): deployed.");
	});

	it("does nothing when no package declares a release-time deploy", async () => {
		const run = fakeRun();
		await plugin(run, {}).success(undefined, context());
		expect(run).not.toHaveBeenCalled();
	});

	it("waits for npm to serve the workspace dependencies' versions before deploying", async () => {
		const run = fakeRun();
		const ctx = context();

		await plugin(run).success(undefined, ctx);

		expect(run).toHaveBeenCalledWith("npm", ["view", `@theholocron/cli@${VERSION}`, "version", "--prefer-online"], {
			cwd: "/repo",
		});
		expect(ctx.logger.log).toHaveBeenCalledWith(
			`deploy-on-release (@theholocron/app): waiting for npm to serve @theholocron/cli@${VERSION}, @theholocron/datapad@${VERSION}.`
		);
	});

	it("skips, saying so, and never deploys when npm still doesn't serve the versions after the timeout", async () => {
		const run = fakeRun({ served: false });
		const clock = fakeClock();
		const ctx = context();

		await plugin(run, undefined, clock).success(undefined, ctx);

		expect(run).not.toHaveBeenCalledWith("pnpm", expect.anything(), expect.anything());
		expect(clock.sleep).toHaveBeenCalled();
		expect(ctx.logger.error).toHaveBeenCalledWith(
			expect.stringContaining(
				`npm still doesn't serve @theholocron/cli@${VERSION}, @theholocron/datapad@${VERSION}`
			)
		);
	});

	it("skips, logging why, when it can't check npm", async () => {
		const run = fakeRun();
		run.mockImplementation((command) => {
			if (command === "npm") throw new Error("spawn npm ENOENT");
			return { status: 0, stdout: "packages/app/x.ts\n", stderr: "" };
		});
		const ctx = context();

		await plugin(run).success(undefined, ctx);

		expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining("couldn't check npm"));
		expect(run).not.toHaveBeenCalledWith("pnpm", expect.anything(), expect.anything());
	});

	it("never throws when the deploy fails -- the release already published", async () => {
		const ctx = context();

		await expect(plugin(fakeRun({ deployStatus: 1 })).success(undefined, ctx)).resolves.toBeUndefined();
		expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining("the deploy failed (exit 1)"));
	});

	it("skips, logging why, when the release doesn't touch the package or its workspace dependencies", async () => {
		const run = fakeRun({ changed: ["packages/astromech/src/x.ts"] });
		const ctx = context();

		await plugin(run).success(undefined, ctx);

		expect(run).toHaveBeenCalledOnce(); // the diff only: no npm wait, no deploy
		expect(ctx.logger.log).toHaveBeenCalledWith(expect.stringContaining("skipping"));
	});

	it("deploys when only a workspace dependency changed", async () => {
		const run = fakeRun({ changed: ["packages/datapad/src/load.ts"] });
		await plugin(run).success(undefined, context());
		expect(run).toHaveBeenCalledWith("pnpm", expect.anything(), expect.anything());
	});

	it("lets explicit paths and channel override the derived ones", async () => {
		const run = fakeRun({ changed: ["docs/x.md"] });
		const ctx = context({ branch: { channel: "beta" }, nextRelease: { gitHead: "new", channel: "beta" } });
		const manifests = {
			"/repo/packages/app": {
				tasks: [{ name: "delivery.deploy", with: { on: "release", channel: "beta", paths: ["docs/"] } }],
			},
		};

		await plugin(run, manifests).success(undefined, ctx);

		expect(run).toHaveBeenCalledWith("pnpm", expect.anything(), expect.anything());
	});

	it("skips a stable (default-channel) release without running git, npm or pnpm", async () => {
		const run = fakeRun();
		const ctx = context({ branch: { channel: null }, nextRelease: { gitHead: "new", channel: null } });

		await plugin(run).success(undefined, ctx);

		expect(run).not.toHaveBeenCalled();
		expect(ctx.logger.log).toHaveBeenCalledWith(expect.stringContaining('channel "default"'));
	});

	it("falls back to the branch's channel when the release doesn't name one", async () => {
		const run = fakeRun();
		await plugin(run).success(undefined, context({ nextRelease: { gitHead: "new" } }));
		expect(run).toHaveBeenCalledWith("pnpm", expect.anything(), expect.anything());
	});

	it("deploys a first release with nothing to diff against, without running git", async () => {
		const run = fakeRun();
		await plugin(run).success(undefined, context({ lastRelease: {} }));
		expect(run).not.toHaveBeenCalledWith("git", expect.anything(), expect.anything());
		expect(run).toHaveBeenCalledWith("pnpm", expect.anything(), expect.anything());
	});

	it("skips, without deploying, when the diff itself fails", async () => {
		const run = fakeRun({ diffStatus: 128 });
		const ctx = context();

		await plugin(run).success(undefined, ctx);

		expect(run).toHaveBeenCalledOnce();
		expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining("git diff failed: bad revision"));
	});

	it("skips, saying so, when a required env var is missing", async () => {
		const run = fakeRun();
		const ctx = context({ env: {} });

		await plugin(run).success(undefined, ctx);

		expect(run).not.toHaveBeenCalledWith("pnpm", expect.anything(), expect.anything());
		expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining("VERCEL_TOKEN isn't set"));
	});

	it("diffs once for several deploying packages, and runs each one's deploy", async () => {
		const run = fakeRun({ changed: ["packages/app/x.ts", "packages/site/y.ts"] });
		const files: Record<string, unknown> = {
			...FILES,
			"/repo/packages/site/package.json": { name: "@theholocron/site", version: "1.0.0" },
		};
		const deploy = (): TasksConfig => ({ tasks: [{ name: "delivery.deploy", with: { on: "release" } }] });

		await createPlugin({
			run,
			readJson: (path) => files[path],
			listDirs: () => ["app", "cli", "datapad", "site"],
			...fakeClock(),
			loadTasks: (dir) => Promise.resolve(dir.endsWith("app") || dir.endsWith("site") ? deploy() : {}),
		}).success(undefined, context());

		expect(run.mock.calls.filter(([command]) => command === "git")).toHaveLength(1);
		const pnpmCalls = run.mock.calls.filter(([command]) => command === "pnpm").map(([, args]) => args[1]);
		expect(pnpmCalls).toEqual(["@theholocron/app", "@theholocron/site"]);
	});

	it("keeps deploying the others when one package's manifest won't load", async () => {
		const run = fakeRun();
		const ctx = context();

		await createPlugin({
			run,
			...TREE,
			...fakeClock(),
			loadTasks: (dir) =>
				dir.endsWith("cli")
					? Promise.reject(new Error("bad config"))
					: Promise.resolve(dir.endsWith("app") ? APP_DEPLOY : {}),
		}).success(undefined, ctx);

		expect(run).toHaveBeenCalledWith("pnpm", expect.anything(), expect.anything());
	});

	it("logs and skips when the workspace can't be read", async () => {
		const run = fakeRun();
		const ctx = context();
		const broken = createPlugin({
			run,
			readJson: TREE.readJson,
			listDirs: () => {
				throw new Error("ENOENT packages");
			},
		});

		await broken.success(undefined, ctx);

		expect(run).not.toHaveBeenCalled();
		expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining("couldn't read the task manifests"));
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
		const run = vi.fn<Run>((_command, args) => {
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
		expect(run.mock.calls.filter(([, args]) => args[1]?.includes("/datapad@"))).toHaveLength(1);
	});

	it("treats a different version from npm as not yet served", async () => {
		const run = vi.fn<Run>(() => ({ status: 0, stdout: "5.0.0-alpha.104\n", stderr: "" }));

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

describe("verifyConditions hook", () => {
	it("warns before publishing when a deploying channel lacks a required env var", async () => {
		const ctx = context({ env: {} });
		await plugin(fakeRun()).verifyConditions(undefined, ctx);
		expect(ctx.logger.warn).toHaveBeenCalledWith(
			expect.stringContaining('(@theholocron/app): VERCEL_TOKEN isn\'t set; a release on "alpha"')
		);
	});

	it("stays quiet with the vars set, or on a channel that doesn't deploy", async () => {
		const withToken = context();
		const otherChannel = context({
			env: {},
			branch: { channel: "beta" },
			nextRelease: { gitHead: "new", channel: "beta" },
		});
		await plugin(fakeRun()).verifyConditions(undefined, withToken);
		await plugin(fakeRun()).verifyConditions(undefined, otherChannel);
		expect(withToken.logger.warn).not.toHaveBeenCalled();
		expect(otherChannel.logger.warn).not.toHaveBeenCalled();
	});
});
