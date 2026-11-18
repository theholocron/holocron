import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { TasksConfig } from "../../config/schema/index.js";
import { deployOnRelease } from "./deploy-on-release.js";
import type { DeployOnReleaseOptions } from "./deploy-on-release.type.js";
import { fakeClock, fakeRun, FILES, TREE, VERSION } from "./test-fixtures.js";

const APP_DEPLOY: TasksConfig = {
	tasks: [{ name: "delivery.deploy", with: { on: "release", channel: "alpha" } }],
};

const OPTIONS = { cwd: "/repo", channel: "alpha", from: "old", to: "new" };

/** The git subcommands `run` was asked for, in order. */
function gitCalls(run: ReturnType<typeof fakeRun>): string[] {
	return run.mock.calls.filter(([command]) => command === "git").map(([, args]) => args[0] ?? "");
}

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

describe("deployOnRelease", () => {
	it("diffs the release, waits for npm, then runs the package's own deploy", async () => {
		const run = fakeRun();

		const { report } = await deploy(run);

		expect(report).toEqual({
			status: "ok",
			results: [{ pkg: "@theholocron/app", status: "ok", message: "deployed." }],
		});
		expect(gitCalls(run)).toEqual(["rev-parse", "diff", "tag", "push"]);
		expect(run.mock.calls.map(([command]) => command)).toEqual(["git", "git", "npm", "npm", "pnpm", "git", "git"]);
		expect(run).toHaveBeenCalledWith("git", ["diff", "--name-only", "old", "new"], { cwd: "/repo" });
		expect(run).toHaveBeenCalledWith("git", ["tag", "--force", "deployed/theholocron-app", "new"], {
			cwd: "/repo",
		});
		expect(run).toHaveBeenCalledWith("pnpm", ["--filter", "@theholocron/app", "run", "deploy"], {
			cwd: "/repo",
			env: process.env,
			stdio: "inherit",
		});
	});

	it("runs a package's old delivery.deploy script when that is the one it has", async () => {
		const run = fakeRun();
		const files: Record<string, unknown> = {
			...FILES,
			"/repo/packages/app/package.json": {
				...(FILES["/repo/packages/app/package.json"] as object),
				scripts: { "delivery.deploy": "x" },
			},
		};
		const report = await deployOnRelease(
			{ ...OPTIONS, print: () => {} },
			{
				run,
				...TREE,
				readJson: (path) => (path in files ? files[path] : TREE.readJson(path)),
				...fakeClock(),
				loadTasks: () => Promise.resolve(APP_DEPLOY),
			}
		);
		expect(report.status).toBe("ok");
		expect(run).toHaveBeenCalledWith(
			"pnpm",
			["--filter", "@theholocron/app", "run", "delivery.deploy"],
			expect.anything()
		);
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
		expect(gitCalls(run)).toEqual(["rev-parse", "diff"]); // no npm wait, no deploy, no marker
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
		expect(run).toHaveBeenCalledWith("pnpm", ["--filter", "@theholocron/app", "run", "deploy"], expect.anything());
	});

	it("deploys when there's no previous release to diff against, without running git", async () => {
		const run = fakeRun();
		const { report } = await deploy(run, { from: undefined });
		expect(report.status).toBe("ok");
		expect(gitCalls(run)).not.toContain("diff");
	});

	it("diffs to HEAD when no release commit is named", async () => {
		const run = fakeRun();
		await deploy(run, { to: undefined });
		expect(run).toHaveBeenCalledWith("git", ["diff", "--name-only", "old", "HEAD"], { cwd: "/repo" });
	});

	it("fails, without deploying, when the diff itself fails", async () => {
		const run = fakeRun({ diffStatus: 128 });

		const { report } = await deploy(run);

		expect(report.status).toBe("fail");
		expect(report.results[0]?.message).toContain("git diff old new failed: bad revision");
		expect(gitCalls(run)).toEqual(["rev-parse", "diff"]);
	});

	it("falls back to the exit status when a failed diff printed nothing", async () => {
		const run = fakeRun();
		run.mockImplementation(() => ({ status: 129, stdout: "", stderr: "" }));

		const { report } = await deploy(run);

		expect(report.results[0]?.message).toBe("git diff old new failed: 129");
	});

	it("doesn't wait on a workspace dependency that has no version, deploying once the rest is served", async () => {
		const run = fakeRun();
		const files: Record<string, unknown> = {
			...FILES,
			"/repo/packages/cli/package.json": { name: "@theholocron/cli" },
		};
		const lines: string[] = [];

		const report = await deployOnRelease(
			{ ...OPTIONS, print: (line) => lines.push(line) },
			{
				run,
				readJson: (path) => files[path],
				listDirs: TREE.listDirs,
				...fakeClock(),
				loadTasks: (dir) => Promise.resolve(dir.endsWith("app") ? APP_DEPLOY : {}),
			}
		);

		expect(report.status).toBe("ok");
		expect(lines).toContain(`@theholocron/app: waiting for npm to serve @theholocron/datapad@${VERSION}.`);
	});

	it("doesn't wait on an unpublished workspace devDependency -- only runtime dependencies gate the deploy (holocron#1071 review)", async () => {
		// @theholocron/build-tool is a workspace:* devDependency, never a
		// runtime one -- npm returning 404 for it specifically (while
		// still serving the real dependencies, cli/datapad) proves it's
		// never even looked up: if the wait list included it, this deploy
		// would fail after timing out instead of succeeding.
		const run = fakeRun();
		run.mockImplementation((command, args) => {
			if (command === "git") return { status: 0, stdout: "packages/app/src/x.ts\n", stderr: "" };
			if (command === "npm") {
				const spec = args[1] as string;
				if (spec.includes("build-tool")) return { status: 1, stdout: "", stderr: "E404 not found" };
				const version = spec.slice(spec.lastIndexOf("@") + 1);
				return { status: 0, stdout: `${version}\n`, stderr: "" };
			}
			return { status: 0, stdout: "", stderr: "" };
		});
		const files: Record<string, unknown> = {
			...FILES,
			"/repo/packages/app/package.json": {
				...(FILES["/repo/packages/app/package.json"] as Record<string, unknown>),
				devDependencies: { "@theholocron/build-tool": "workspace:*" },
			},
			"/repo/packages/build-tool/package.json": { name: "@theholocron/build-tool", version: VERSION },
		};
		const lines: string[] = [];

		const report = await deployOnRelease(
			{ ...OPTIONS, print: (line) => lines.push(line) },
			{
				run,
				readJson: (path) => files[path],
				listDirs: () => ["app", "astromech", "build-tool", "cli", "datapad"],
				...fakeClock(),
				loadTasks: (dir) => Promise.resolve(dir.endsWith("app") ? APP_DEPLOY : {}),
			}
		);

		expect(report.status).toBe("ok");
		expect(run.mock.calls.some(([command, args]) => command === "npm" && args[1]?.includes("build-tool"))).toBe(
			false
		);
		expect(lines.find((l) => l.includes("waiting for npm"))).not.toContain("build-tool");
	});

	it("reports what it would deploy, and deploys nothing, on a dry run", async () => {
		const run = fakeRun();

		const { report } = await deploy(run, { dryRun: true });

		expect(report.status).toBe("ok");
		expect(report.results[0]).toMatchObject({ status: "dry-run" });
		expect(gitCalls(run)).toEqual(["rev-parse", "diff"]); // no wait, no deploy, no marker
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
		expect(gitCalls(run).filter((sub) => sub === "diff")).toHaveLength(1);
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

	it("recovers a missed deploy: diffs from the last deployed commit, so a later release that touches nothing in the app still deploys it", async () => {
		// The release's own range (old..new) holds nothing for the app, but the app was last deployed at `deadbeef`.
		const run = fakeRun({ marker: "deadbeef00" });
		run.mockImplementation((command, args) => {
			if (command === "git" && args[0] === "diff") {
				const changed = args[2] === "deadbeef00" ? "packages/app/src/handler.ts\n" : "docs/x.md\n";
				return { status: 0, stdout: changed, stderr: "" };
			}
			return fakeRun({ marker: "deadbeef00" })(command, args, {});
		});

		const { report } = await deploy(run);

		expect(run).toHaveBeenCalledWith("git", ["diff", "--name-only", "deadbeef00", "new"], { cwd: "/repo" });
		expect(report.status).toBe("ok");
		expect(report.results[0]?.message).toBe("deployed.");
		expect(run).toHaveBeenCalledWith("pnpm", ["--filter", "@theholocron/app", "run", "deploy"], expect.anything());
	});

	it("skips an app whose recorded deploy is up to date with the release", async () => {
		const run = fakeRun({ marker: "deadbeef00", changed: [] });

		const { report } = await deploy(run);

		expect(report.status).toBe("skip");
		expect(report.results[0]?.message).toContain("since its last deploy (deadbee)");
		expect(report.results[0]?.message).not.toContain("No deploy is recorded");
		expect(run).not.toHaveBeenCalledWith("pnpm", expect.anything(), expect.anything());
		expect(gitCalls(run)).not.toContain("tag");
	});

	it("falls back to the previous release for an app with no recorded deploy, saying so, and records one once it deploys", async () => {
		const skipped = await deploy(fakeRun({ changed: ["docs/x.md"] }));
		expect(skipped.report.results[0]?.message).toContain("No deploy is recorded for it yet.");

		const run = fakeRun();
		const { report } = await deploy(run);
		expect(report.status).toBe("ok");
		expect(run).toHaveBeenCalledWith("git", ["diff", "--name-only", "old", "new"], { cwd: "/repo" });
		expect(run).toHaveBeenCalledWith("git", ["push", "--force", "origin", "refs/tags/deployed/theholocron-app"], {
			cwd: "/repo",
		});
	});

	it("ignores a marker that is not an ancestor of the release and uses the previous release", async () => {
		const run = fakeRun({ marker: "deadbeef00", markerAncestor: false });

		const { report, lines } = await deploy(run);

		expect(report.status).toBe("ok");
		expect(run).toHaveBeenCalledWith("git", ["diff", "--name-only", "old", "new"], { cwd: "/repo" });
		expect(lines.join("\n")).toContain("is not an ancestor of new; ignoring it");
	});

	it("records no deploy when the deploy fails, so the next release tries again", async () => {
		const run = fakeRun({ deployStatus: 1 });

		await deploy(run);

		expect(gitCalls(run)).not.toContain("tag");
		expect(gitCalls(run)).not.toContain("push");
	});

	it("warns, without failing the deploy, when the marker cannot be pushed", async () => {
		const { report } = await deploy(fakeRun({ pushStatus: 1 }));

		expect(report.status).toBe("ok");
		expect(report.results[0]?.message).toContain("deployed, but couldn't push deployed/theholocron-app: denied");
	});

	it("writes no marker on a dry run", async () => {
		const run = fakeRun();
		await deploy(run, { dryRun: true });
		expect(gitCalls(run)).not.toContain("tag");
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

describe("deployOnRelease on a real repo", () => {
	const dirs: string[] = [];
	const tmp = () => {
		const dir = mkdtempSync(join(tmpdir(), "deploy-on-release-"));
		dirs.push(dir);
		return dir;
	};
	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	it("runs end to end on a real repo and manifest: diffs with git and reads the package's holocron.config", async () => {
		const repo = tmp();
		// Hermetic: a developer's global git config (hooks, templates, rerere) otherwise
		// spawns background writers into `.git`, which race the cleanup below (ENOTEMPTY).
		const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
		const git = (...args: string[]) =>
			execFileSync("git", args, { cwd: repo, stdio: "pipe", env }).toString().trim();
		mkdirSync(join(repo, "packages", "app", "src"), { recursive: true });
		writeFileSync(join(repo, "packages", "app", "package.json"), '{"name":"@x/app","version":"1.0.0"}');
		writeFileSync(
			join(repo, "packages", "app", "holocron.config.json"),
			JSON.stringify({ tasks: [{ name: "delivery.deploy", with: { on: "release", channel: "alpha" } }] })
		);
		git("init", "-q", "--template=");
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
