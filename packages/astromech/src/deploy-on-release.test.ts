import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { TasksConfig } from "./config/schema.js";
import {
	defaultListDirs,
	defaultPaths,
	defaultReadJson,
	defaultRun,
	defaultSleep,
	deployOnRelease,
	type DeployOnReleaseOptions,
	deployTargets,
	type Run,
	shouldDeploy,
	waitForPublished,
	workspaceDependencies,
	workspacePackages,
} from "./deploy-on-release.js";

const VERSION = "5.0.0-alpha.105";
const PATHS = ["packages/app/", "packages/cli/"];

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
	tasks: [{ name: "delivery.deploy", with: { on: "release", channel: "alpha" } }],
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

const OPTIONS = { cwd: "/repo", channel: "alpha", from: "old", to: "new" };

/** `deployOnRelease` over the fake tree and clock, so nothing touches git, npm, pnpm, disk or time. */
function deploy(
	run: ReturnType<typeof fakeRun>,
	options: Partial<DeployOnReleaseOptions> = {},
	manifests: Record<string, TasksConfig> = { "/repo/packages/app": APP_DEPLOY },
	clock = fakeClock()
) {
	const lines: string[] = [];
	const report = deployOnRelease(
		{ ...OPTIONS, print: (line) => lines.push(line), ...options },
		{ run, ...TREE, ...clock, loadTasks: (dir) => Promise.resolve(manifests[dir] ?? {}) }
	);
	return report.then((r) => ({ report: r, lines }));
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

	it("skips another channel, including the stable one (`main`)", () => {
		expect(shouldDeploy({ channel: "main", configuredChannel: "alpha", changedFiles: [], paths: [] })).toEqual({
			deploy: false,
			reason: 'channel "main" isn\'t "alpha"',
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
					with: { on: "release", channel: "beta", paths: ["docs/"] },
				},
			])
		);
		expect(targets).toEqual([
			{
				pkg: expect.objectContaining({ name: "@theholocron/app" }),
				channel: "beta",
				paths: ["docs/"],
			},
		]);
	});

	it("defaults the channel to main (stable), with no explicit paths or requirements", () => {
		const [target] = deployTargets(all, manifest([{ name: "delivery.deploy", with: { on: "release" } }]));
		expect(target).toMatchObject({ channel: "main", paths: undefined });
	});

	it("ignores a bare delivery.deploy and packages with no manifest", () => {
		expect(deployTargets(all, manifest(["delivery.deploy"]))).toEqual([]);
		expect(deployTargets(all, new Map())).toEqual([]);
	});
});

describe("deployOnRelease", () => {
	it("diffs the release, waits for npm, then runs the package's own deploy", async () => {
		const run = fakeRun();

		const { report } = await deploy(run);

		expect(report).toEqual({
			status: "ok",
			results: [{ pkg: "@theholocron/app", status: "ok", message: "deployed." }],
		});
		expect(run.mock.calls.map(([command]) => command)).toEqual(["git", "npm", "npm", "pnpm"]);
		expect(run).toHaveBeenNthCalledWith(1, "git", ["diff", "--name-only", "old", "new"], { cwd: "/repo" });
		expect(run).toHaveBeenCalledWith("pnpm", ["--filter", "@theholocron/app", "delivery.deploy"], {
			cwd: "/repo",
			env: process.env,
			stdio: "inherit",
		});
	});

	it("skips, without failing, when no package declares a release-time deploy", async () => {
		const run = fakeRun();

		const { report, lines } = await deploy(run, {}, {});

		expect(report).toEqual({ status: "skip", results: [] });
		expect(run).not.toHaveBeenCalled();
		expect(lines).toEqual(["No package declares a release-time delivery.deploy (with.on: release)."]);
	});

	it("waits for npm to serve the workspace dependencies' versions before deploying", async () => {
		const run = fakeRun();

		const { lines } = await deploy(run);

		expect(run).toHaveBeenCalledWith("npm", ["view", `@theholocron/cli@${VERSION}`, "version", "--prefer-online"], {
			cwd: "/repo",
		});
		expect(lines).toContain(
			`@theholocron/app: waiting for npm to serve @theholocron/cli@${VERSION}, @theholocron/datapad@${VERSION}.`
		);
	});

	it("fails, never deploying, when npm still doesn't serve the versions after the timeout", async () => {
		const run = fakeRun({ served: false });
		const clock = fakeClock();

		const { report } = await deploy(run, {}, undefined, clock);

		expect(report.status).toBe("fail");
		expect(report.results[0]?.message).toContain(
			`npm still doesn't serve @theholocron/cli@${VERSION}, @theholocron/datapad@${VERSION}`
		);
		expect(run).not.toHaveBeenCalledWith("pnpm", expect.anything(), expect.anything());
		expect(clock.sleep).toHaveBeenCalled();
	});

	it("fails when the deploy fails -- the release already published, so this job is the signal", async () => {
		const { report, lines } = await deploy(fakeRun({ deployStatus: 1 }));

		expect(report.status).toBe("fail");
		expect(report.results).toEqual([
			{ pkg: "@theholocron/app", status: "fail", message: "the deploy failed (exit 1)." },
		]);
		expect(lines).toContain("✗ @theholocron/app: the deploy failed (exit 1).");
	});

	it("skips, saying why, when the release doesn't touch the package or its workspace dependencies", async () => {
		const run = fakeRun({ changed: ["packages/astromech/src/x.ts"] });

		const { report } = await deploy(run);

		expect(report.status).toBe("skip");
		expect(report.results[0]?.message).toContain("not deploying: the release changes nothing under");
		expect(run).toHaveBeenCalledOnce(); // the diff only: no npm wait, no deploy
	});

	it("deploys when only a workspace dependency changed", async () => {
		const run = fakeRun({ changed: ["packages/datapad/src/load.ts"] });
		const { report } = await deploy(run);
		expect(report.status).toBe("ok");
	});

	it("lets explicit paths and channel override the derived ones", async () => {
		const run = fakeRun({ changed: ["docs/x.md"] });
		const manifests = {
			"/repo/packages/app": {
				tasks: [{ name: "delivery.deploy", with: { on: "release", channel: "beta", paths: ["docs/"] } }],
			},
		};

		const { report } = await deploy(run, { channel: "beta" }, manifests);

		expect(report.status).toBe("ok");
	});

	it("skips a stable release (empty channel is `main`) without running git, npm or pnpm", async () => {
		const run = fakeRun();

		const { report, lines } = await deploy(run, { channel: "" });

		expect(report.status).toBe("skip");
		expect(run).not.toHaveBeenCalled();
		expect(lines.join("\n")).toContain('channel "main"');
	});

	it("deploys a stable release (empty channel) for a task that sets no channel, since main is the default", async () => {
		const run = fakeRun();
		const manifests = { "/repo/packages/app": { tasks: [{ name: "delivery.deploy", with: { on: "release" } }] } };

		const { report } = await deploy(run, { channel: "" }, manifests);

		expect(report.status).toBe("ok");
		expect(run).toHaveBeenCalledWith(
			"pnpm",
			["--filter", "@theholocron/app", "delivery.deploy"],
			expect.anything()
		);
	});

	it("deploys when there's no previous release to diff against, without running git", async () => {
		const run = fakeRun();
		const { report } = await deploy(run, { from: undefined });
		expect(report.status).toBe("ok");
		expect(run).not.toHaveBeenCalledWith("git", expect.anything(), expect.anything());
	});

	it("diffs to HEAD when no release commit is named", async () => {
		const run = fakeRun();
		await deploy(run, { to: undefined });
		expect(run).toHaveBeenNthCalledWith(1, "git", ["diff", "--name-only", "old", "HEAD"], { cwd: "/repo" });
	});

	it("fails, without deploying, when the diff itself fails", async () => {
		const run = fakeRun({ diffStatus: 128 });

		const { report } = await deploy(run);

		expect(report.status).toBe("fail");
		expect(report.results[0]?.message).toContain("git diff old new failed: bad revision");
		expect(run).toHaveBeenCalledOnce();
	});

	it("reports what it would deploy, and deploys nothing, on a dry run", async () => {
		const run = fakeRun();

		const { report } = await deploy(run, { dryRun: true });

		expect(report.status).toBe("ok");
		expect(report.results[0]).toMatchObject({ status: "dry-run" });
		expect(run).toHaveBeenCalledOnce(); // the diff only
	});

	it("diffs once for several deploying packages, and runs each one's deploy", async () => {
		const run = fakeRun({ changed: ["packages/app/x.ts", "packages/site/y.ts"] });
		const files: Record<string, unknown> = {
			...FILES,
			"/repo/packages/site/package.json": { name: "@theholocron/site", version: "1.0.0" },
		};
		const manifest: TasksConfig = {
			tasks: [{ name: "delivery.deploy", with: { on: "release", channel: "alpha" } }],
		};
		const lines: string[] = [];

		const report = await deployOnRelease(
			{ ...OPTIONS, print: (line) => lines.push(line) },
			{
				run,
				readJson: (path) => files[path],
				listDirs: () => ["app", "cli", "datapad", "site"],
				...fakeClock(),
				loadTasks: (dir) => Promise.resolve(dir.endsWith("app") || dir.endsWith("site") ? manifest : {}),
			}
		);

		expect(report.status).toBe("ok");
		expect(run.mock.calls.filter(([command]) => command === "git")).toHaveLength(1);
		const deployed = run.mock.calls.filter(([command]) => command === "pnpm").map(([, args]) => args[1]);
		expect(deployed).toEqual(["@theholocron/app", "@theholocron/site"]);
	});

	it("fails the run, but still deploys the others, when one package's deploy fails", async () => {
		const run = fakeRun({ changed: ["packages/app/x.ts", "packages/site/y.ts"] });
		run.mockImplementation((command, args) => {
			if (command === "git") return { status: 0, stdout: "packages/app/x.ts\npackages/site/y.ts\n", stderr: "" };
			if (command === "npm") return { status: 0, stdout: `${(args[1] ?? "").split("@").pop()}\n`, stderr: "" };
			return { status: args[1] === "@theholocron/app" ? 1 : 0, stdout: "", stderr: "" };
		});
		const files: Record<string, unknown> = {
			...FILES,
			"/repo/packages/site/package.json": { name: "@theholocron/site", version: "1.0.0" },
		};
		const manifest: TasksConfig = {
			tasks: [{ name: "delivery.deploy", with: { on: "release", channel: "alpha" } }],
		};

		const report = await deployOnRelease(
			{ ...OPTIONS, print: () => undefined },
			{
				run,
				readJson: (path) => files[path],
				listDirs: () => ["app", "cli", "datapad", "site"],
				...fakeClock(),
				loadTasks: (dir) => Promise.resolve(dir.endsWith("app") || dir.endsWith("site") ? manifest : {}),
			}
		);

		expect(report.status).toBe("fail");
		expect(report.results.map((r) => [r.pkg, r.status])).toEqual([
			["@theholocron/app", "fail"],
			["@theholocron/site", "ok"],
		]);
	});

	it("keeps going, saying so, when one package's manifest won't load", async () => {
		const run = fakeRun();
		const lines: string[] = [];

		const report = await deployOnRelease(
			{ ...OPTIONS, print: (line) => lines.push(line) },
			{
				run,
				...TREE,
				...fakeClock(),
				loadTasks: (dir) =>
					dir.endsWith("cli")
						? Promise.reject(new Error("bad config"))
						: Promise.resolve(dir.endsWith("app") ? APP_DEPLOY : {}),
			}
		);

		expect(report.status).toBe("ok");
		expect(lines).toContain("@theholocron/cli: couldn't read its task manifest (bad config); not deploying it.");
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

describe("the real defaults", () => {
	const dirs: string[] = [];
	const tmp = () => {
		const dir = mkdtempSync(join(tmpdir(), "deploy-on-release-"));
		dirs.push(dir);
		return dir;
	};
	afterEach(() => {
		vi.useRealTimers();
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	it("defaultRun runs a command and captures its output and status", () => {
		const ok = defaultRun("node", ["-e", "process.stdout.write('hi')"], {});
		expect(ok).toMatchObject({ status: 0, stdout: "hi" });
		expect(defaultRun("node", ["-e", "process.exit(3)"], {}).status).toBe(3);
	});

	it("defaultReadJson parses a file, and throws for a missing one", () => {
		const dir = tmp();
		writeFileSync(join(dir, "a.json"), '{"name":"x"}');
		expect(defaultReadJson(join(dir, "a.json"))).toEqual({ name: "x" });
		expect(() => defaultReadJson(join(dir, "missing.json"))).toThrow();
	});

	it("defaultListDirs lists only the folders", () => {
		const dir = tmp();
		mkdirSync(join(dir, "a"));
		mkdirSync(join(dir, "b"));
		writeFileSync(join(dir, "file.txt"), "");
		expect(defaultListDirs(dir).sort()).toEqual(["a", "b"]);
	});

	it("defaultSleep resolves after the delay", async () => {
		vi.useFakeTimers();
		let done = false;
		const sleeping = defaultSleep(1000).then(() => (done = true));
		await vi.advanceTimersByTimeAsync(999);
		expect(done).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		await sleeping;
		expect(done).toBe(true);
	});

	it("runs end to end on a real repo and manifest: diffs with git and reads the package's holocron.config", async () => {
		const repo = tmp();
		const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "pipe" }).toString().trim();
		mkdirSync(join(repo, "packages", "app", "src"), { recursive: true });
		writeFileSync(join(repo, "packages", "app", "package.json"), '{"name":"@x/app","version":"1.0.0"}');
		writeFileSync(
			join(repo, "packages", "app", "holocron.config.json"),
			JSON.stringify({ tasks: [{ name: "delivery.deploy", with: { on: "release", channel: "alpha" } }] })
		);
		git("init", "-q");
		git("config", "user.email", "t@example.com");
		git("config", "user.name", "t");
		git("config", "commit.gpgsign", "false");
		git("add", "-A");
		git("commit", "-q", "-m", "first");
		const first = git("rev-parse", "HEAD");
		writeFileSync(join(repo, "packages", "app", "src", "x.ts"), "export {};");
		git("add", "-A");
		git("commit", "-q", "-m", "second");

		const lines: string[] = [];
		const report = await deployOnRelease({
			cwd: repo,
			channel: "alpha",
			from: first,
			dryRun: true,
			print: (line) => lines.push(line),
		});

		expect(report.status).toBe("ok");
		expect(report.results[0]).toMatchObject({ pkg: "@x/app", status: "dry-run" });
		expect(report.results[0]?.message).toContain("packages/app/src/x.ts");
	});
});
