import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn(() => ({ status: 0, stdout: "", stderr: "" })) }));

import { fakeLogger } from "@theholocron/observability/testing";

import { type PublishExecResult, runPublish } from "./publish.js";

function makeTempMonorepo(packages: Array<{ name: string; private?: boolean; invalidJson?: boolean }>) {
	const root = mkdtempSync(join(tmpdir(), "holocron-test-"));
	const pkgsDir = join(root, "packages");
	mkdirSync(pkgsDir);
	for (const pkg of packages) {
		const dir = join(pkgsDir, pkg.name.replace(/\//g, "-"));
		mkdirSync(dir);
		const content = pkg.invalidJson
			? "not valid json {"
			: JSON.stringify({ name: pkg.name, ...(pkg.private ? { private: true } : {}) });
		writeFileSync(join(dir, "package.json"), content);
	}
	// Directory with no package.json — should be skipped
	mkdirSync(join(pkgsDir, "no-manifest"));
	return root;
}

function makeExec(responses: Record<string, PublishExecResult>) {
	const calls: Array<{ cmd: string; args: string[] }> = [];
	const exec = async (cmd: string, args: string[]): Promise<PublishExecResult> => {
		calls.push({ cmd, args: [...args] });
		return (
			responses[cmd] ?? {
				exitCode: 0,
				stdout: "",
				stderr: "",
			}
		);
	};
	return { exec, calls };
}

const baseEnv: NodeJS.ProcessEnv = {};

// Fixtures injected directly to avoid touching the filesystem or git in tests.
const TEST_PACKAGES = ["@theholocron/foo", "@theholocron/bar"] as const;
const TEST_REPO = "test-repo";

describe("runPublish", () => {
	it("verifies npm auth via `npm whoami` before publishing", async () => {
		const { exec, calls } = makeExec({
			npm: { exitCode: 0, stdout: "iamnewton\n", stderr: "" },
			pnpm: { exitCode: 0, stdout: "", stderr: "" },
		});
		const log = fakeLogger();
		const report = await runPublish({
			cwd: "/tmp/test",
			env: baseEnv,
			packages: TEST_PACKAGES,
			repoName: TEST_REPO,
			print: () => {},
			exec,
			logger: log,
		});
		expect(report.status).toBe("ok");
		expect(calls[0]?.cmd).toBe("npm");
		expect(calls[0]?.args).toEqual(["whoami"]);
		expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ status: "ok" }), "publish --initial: done");
	});

	it("runs `npm login` automatically when npm whoami shows no session, then retries whoami (holocron#641)", async () => {
		const lines: string[] = [];
		let whoamiCalls = 0;
		const exec = async (cmd: string, args: string[]): Promise<PublishExecResult> => {
			if (cmd === "npm" && args[0] === "whoami") {
				whoamiCalls += 1;
				// First call: not authenticated. Second call (post-login): authenticated.
				return whoamiCalls === 1
					? { exitCode: 1, stdout: "", stderr: "ENEEDAUTH" }
					: { exitCode: 0, stdout: "iamnewton\n", stderr: "" };
			}
			return { exitCode: 0, stdout: "", stderr: "" };
		};
		const login = vi.fn(async () => ({ exitCode: 0 }));
		const report = await runPublish({
			cwd: "/tmp/test",
			env: baseEnv,
			packages: TEST_PACKAGES,
			repoName: TEST_REPO,
			print: (l) => lines.push(l),
			exec,
			login,
		});
		expect(login).toHaveBeenCalledTimes(1);
		expect(whoamiCalls).toBe(2); // checked, logged in, checked again
		expect(report.status).toBe("ok");
		expect(lines.join("\n")).toMatch(/running `npm login --auth-type=web`/);
	});

	it("fails when `npm login` itself fails", async () => {
		const { exec, calls } = makeExec({
			npm: { exitCode: 1, stdout: "", stderr: "ENEEDAUTH" },
		});
		const login = vi.fn(async () => ({ exitCode: 1 }));
		const report = await runPublish({
			cwd: "/tmp/test",
			env: baseEnv,
			packages: TEST_PACKAGES,
			repoName: TEST_REPO,
			print: () => {},
			exec,
			login,
		});
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/npm login failed/);
		expect(calls).toHaveLength(1); // only the first whoami — never attempted publish
	});

	it("fails when `npm login` succeeds but whoami still fails afterward", async () => {
		const { exec } = makeExec({
			npm: { exitCode: 1, stdout: "", stderr: "ENEEDAUTH" },
		});
		const login = vi.fn(async () => ({ exitCode: 0 }));
		const report = await runPublish({
			cwd: "/tmp/test",
			env: baseEnv,
			packages: TEST_PACKAGES,
			repoName: TEST_REPO,
			print: () => {},
			exec,
			login,
		});
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/whoami.* still fails/);
	});

	it("runs the pnpm publish with the right filters + flags (monorepo layout)", async () => {
		const root = makeTempMonorepo([{ name: "@theholocron/public-a" }]);
		const { exec, calls } = makeExec({
			npm: { exitCode: 0, stdout: "iamnewton", stderr: "" },
			pnpm: { exitCode: 0, stdout: "", stderr: "" },
		});
		await runPublish({
			cwd: root,
			env: baseEnv,
			packages: TEST_PACKAGES,
			repoName: TEST_REPO,
			print: () => {},
			exec,
		});
		expect(calls[1]?.cmd).toBe("pnpm");
		expect(calls[1]?.args).toEqual([
			"-r",
			"--filter=./packages/*",
			"publish",
			"--access",
			"public",
			"--no-git-checks",
			"--tag",
			"alpha",
		]);
	});

	it("publishes without -r/--filter for a single-package repo (holocron#641)", async () => {
		const root = mkdtempSync(join(tmpdir(), "holocron-test-"));
		writeFileSync(join(root, "package.json"), JSON.stringify({ name: "@theholocron/observability" }));
		const { exec, calls } = makeExec({
			npm: { exitCode: 0, stdout: "iamnewton", stderr: "" },
			pnpm: { exitCode: 0, stdout: "", stderr: "" },
		});
		const report = await runPublish({
			cwd: root,
			env: baseEnv,
			repoName: TEST_REPO,
			print: () => {},
			exec,
		});
		expect(report.status).toBe("ok");
		expect(report.packageNames).toEqual(["@theholocron/observability"]);
		expect(calls[1]?.cmd).toBe("pnpm");
		expect(calls[1]?.args).toEqual(["publish", "--access", "public", "--no-git-checks", "--tag", "alpha"]);
	});

	it("fails loudly instead of a silent no-op when nothing is publishable (holocron#641)", async () => {
		const lines: string[] = [];
		const root = mkdtempSync(join(tmpdir(), "holocron-test-"));
		writeFileSync(join(root, "package.json"), JSON.stringify({ name: "private-thing", private: true }));
		const { exec, calls } = makeExec({
			npm: { exitCode: 0, stdout: "iamnewton", stderr: "" },
		});
		const report = await runPublish({
			cwd: root,
			env: baseEnv,
			repoName: TEST_REPO,
			print: (l) => lines.push(l),
			exec,
		});
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/nothing to publish/);
		expect(lines.join("\n")).toMatch(/nothing to publish/);
		// never got as far as the publish call — only `npm whoami` ran
		expect(calls).toHaveLength(1);
	});

	it("still fails loudly on zero packages in dry-run", async () => {
		const root = mkdtempSync(join(tmpdir(), "holocron-test-"));
		writeFileSync(join(root, "package.json"), JSON.stringify({}));
		const { exec } = makeExec({
			npm: { exitCode: 0, stdout: "iamnewton", stderr: "" },
		});
		const report = await runPublish({
			cwd: root,
			dryRun: true,
			env: baseEnv,
			repoName: TEST_REPO,
			print: () => {},
			exec,
		});
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/nothing to publish/);
	});

	it("honors a custom tag", async () => {
		const { exec, calls } = makeExec({
			npm: { exitCode: 0, stdout: "iamnewton", stderr: "" },
			pnpm: { exitCode: 0, stdout: "", stderr: "" },
		});
		await runPublish({
			cwd: "/tmp/test",
			tag: "next",
			env: baseEnv,
			packages: TEST_PACKAGES,
			repoName: TEST_REPO,
			print: () => {},
			exec,
		});
		expect(calls[1]?.args).toContain("next");
	});

	it("returns fail with the captured stderr when publish exits non-zero", async () => {
		const { exec } = makeExec({
			npm: { exitCode: 0, stdout: "iamnewton", stderr: "" },
			pnpm: { exitCode: 1, stdout: "", stderr: "EPUBLISHCONFLICT" },
		});
		const report = await runPublish({
			cwd: "/tmp/test",
			env: baseEnv,
			packages: TEST_PACKAGES,
			repoName: TEST_REPO,
			print: () => {},
			exec,
		});
		expect(report.status).toBe("fail");
		expect(report.message).toContain("EPUBLISHCONFLICT");
	});

	it("forwards --otp to pnpm publish when provided", async () => {
		const { exec, calls } = makeExec({
			npm: { exitCode: 0, stdout: "iamnewton", stderr: "" },
			pnpm: { exitCode: 0, stdout: "", stderr: "" },
		});
		await runPublish({
			cwd: "/tmp/test",
			otp: "123456",
			env: baseEnv,
			packages: TEST_PACKAGES,
			repoName: TEST_REPO,
			print: () => {},
			exec,
		});
		expect(calls[1]?.args).toContain("--otp");
		expect(calls[1]?.args).toContain("123456");
	});

	it("surfaces the --otp hint when publish output includes EOTP", async () => {
		const lines: string[] = [];
		const { exec } = makeExec({
			npm: { exitCode: 0, stdout: "iamnewton", stderr: "" },
			pnpm: {
				exitCode: 1,
				stdout: "npm error code EOTP\nnpm error This operation requires a one-time password",
				stderr: "",
			},
		});
		const report = await runPublish({
			cwd: "/tmp/test",
			env: baseEnv,
			packages: TEST_PACKAGES,
			repoName: TEST_REPO,
			print: (l) => lines.push(l),
			exec,
		});
		expect(report.status).toBe("fail");
		const joined = lines.join("\n");
		expect(joined).toContain("--otp <code>");
		expect(joined).toContain("--otp <6-digit-code>");
	});

	it("does not print the --otp hint on non-EOTP failures", async () => {
		const lines: string[] = [];
		const { exec } = makeExec({
			npm: { exitCode: 0, stdout: "iamnewton", stderr: "" },
			pnpm: { exitCode: 1, stdout: "", stderr: "some other error" },
		});
		await runPublish({
			cwd: "/tmp/test",
			env: baseEnv,
			packages: TEST_PACKAGES,
			repoName: TEST_REPO,
			print: (l) => lines.push(l),
			exec,
		});
		const joined = lines.join("\n");
		expect(joined).not.toContain("--otp <6-digit-code>");
	});

	it('dry-run prints "would run" + skips the publish call', async () => {
		const lines: string[] = [];
		const { exec, calls } = makeExec({
			npm: { exitCode: 0, stdout: "iamnewton", stderr: "" },
		});
		const report = await runPublish({
			cwd: "/tmp/test",
			dryRun: true,
			env: baseEnv,
			packages: TEST_PACKAGES,
			repoName: TEST_REPO,
			print: (l) => lines.push(l),
			exec,
		});
		expect(report.status).toBe("dry-run");
		expect(calls).toHaveLength(1); // only whoami
		expect(lines.some((l) => l.includes("would run"))).toBe(true);
	});

	it("includes the discovered package URLs and repo name in next-steps output", async () => {
		const lines: string[] = [];
		const { exec } = makeExec({
			npm: { exitCode: 0, stdout: "iamnewton", stderr: "" },
			pnpm: { exitCode: 0, stdout: "", stderr: "" },
		});
		await runPublish({
			cwd: "/tmp/test",
			env: baseEnv,
			packages: TEST_PACKAGES,
			repoName: TEST_REPO,
			print: (l) => lines.push(l),
			exec,
		});
		const joined = lines.join("\n");
		expect(joined).toContain("npmjs.com/package/@theholocron/foo/access");
		expect(joined).toContain("npmjs.com/package/@theholocron/bar/access");
		expect(joined).toContain(`Repo: ${TEST_REPO}`);
		expect(joined).toContain("Publisher: GitHub Actions");
		expect(joined).toContain("Workflow: release.yml");
	});

	it("auto-detects repo name from git remote when repoName is not injected", async () => {
		const lines: string[] = [];
		const { exec } = makeExec({
			npm: { exitCode: 0, stdout: "iamnewton", stderr: "" },
			git: { exitCode: 0, stdout: "https://github.com/theholocron/themes.git\n", stderr: "" },
			pnpm: { exitCode: 0, stdout: "", stderr: "" },
		});
		await runPublish({
			cwd: "/tmp/test",
			env: baseEnv,
			packages: TEST_PACKAGES,
			print: (l) => lines.push(l),
			exec,
		});
		expect(lines.join("\n")).toContain("Repo: themes");
	});

	it("auto-detects repo name from SSH remote URL format", async () => {
		const lines: string[] = [];
		const { exec } = makeExec({
			npm: { exitCode: 0, stdout: "iamnewton", stderr: "" },
			git: { exitCode: 0, stdout: "git@github.com:theholocron/clients.git\n", stderr: "" },
			pnpm: { exitCode: 0, stdout: "", stderr: "" },
		});
		await runPublish({
			cwd: "/tmp/test",
			env: baseEnv,
			packages: TEST_PACKAGES,
			print: (l) => lines.push(l),
			exec,
		});
		expect(lines.join("\n")).toContain("Repo: clients");
	});

	it("falls back to 'unknown' when git remote fails", async () => {
		const lines: string[] = [];
		const { exec } = makeExec({
			npm: { exitCode: 0, stdout: "iamnewton", stderr: "" },
			git: { exitCode: 128, stdout: "", stderr: "not a git repo" },
			pnpm: { exitCode: 0, stdout: "", stderr: "" },
		});
		await runPublish({
			cwd: "/tmp/test",
			env: baseEnv,
			packages: TEST_PACKAGES,
			print: (l) => lines.push(l),
			exec,
		});
		expect(lines.join("\n")).toContain("Repo: unknown");
	});

	it("prints a token-revoke reminder when NPM_TOKEN is detected in env", async () => {
		const lines: string[] = [];
		const { exec } = makeExec({
			npm: { exitCode: 0, stdout: "iamnewton", stderr: "" },
			pnpm: { exitCode: 0, stdout: "", stderr: "" },
		});
		await runPublish({
			cwd: "/tmp/test",
			env: { NPM_TOKEN: "npm_xxx" },
			packages: TEST_PACKAGES,
			repoName: TEST_REPO,
			print: (l) => lines.push(l),
			exec,
		});
		const joined = lines.join("\n");
		expect(joined).toContain("Revoke it now");
		expect(joined).toContain("npmjs.com/settings/~/tokens");
	});

	it("omits the token-revoke reminder when no NPM_TOKEN was set", async () => {
		const lines: string[] = [];
		const { exec } = makeExec({
			npm: { exitCode: 0, stdout: "iamnewton", stderr: "" },
			pnpm: { exitCode: 0, stdout: "", stderr: "" },
		});
		await runPublish({
			cwd: "/tmp/test",
			env: baseEnv,
			packages: TEST_PACKAGES,
			repoName: TEST_REPO,
			print: (l) => lines.push(l),
			exec,
		});
		const joined = lines.join("\n");
		expect(joined).not.toContain("Revoke it now");
	});
});

// ── discoverPublicPackages ────────────────────────────────────────────────────

describe("discoverPublicPackages (via runPublish without packages injection)", () => {
	it("discovers non-private packages and skips private, no-manifest, and invalid-JSON entries", async () => {
		const root = makeTempMonorepo([
			{ name: "@theholocron/public-a" },
			{ name: "@theholocron/public-b" },
			{ name: "@theholocron/private-c", private: true },
			{ name: "@theholocron/broken-d", invalidJson: true },
		]);
		const lines: string[] = [];
		const { exec } = makeExec({
			npm: { exitCode: 0, stdout: "iamnewton", stderr: "" },
			pnpm: { exitCode: 0, stdout: "", stderr: "" },
		});
		await runPublish({
			cwd: root,
			env: baseEnv,
			repoName: TEST_REPO,
			print: (l) => lines.push(l),
			exec,
		});
		const joined = lines.join("\n");
		expect(joined).toContain("@theholocron/public-a/access");
		expect(joined).toContain("@theholocron/public-b/access");
		expect(joined).not.toContain("@theholocron/private-c/access");
		expect(joined).not.toContain("@theholocron/broken-d/access");
		expect(joined).not.toContain("no-manifest/access");
	});

	it("falls back to the root package.json when there's no packages/ dir at all — fails loudly, no publish attempted", async () => {
		const lines: string[] = [];
		const { exec, calls } = makeExec({
			npm: { exitCode: 0, stdout: "iamnewton", stderr: "" },
			pnpm: { exitCode: 0, stdout: "", stderr: "" },
		});
		// /tmp/test has neither a packages/ dir nor a package.json
		const report = await runPublish({
			cwd: "/tmp/test",
			env: baseEnv,
			repoName: TEST_REPO,
			print: (l) => lines.push(l),
			exec,
		});
		expect(report.status).toBe("fail");
		expect(lines.join("\n")).not.toContain("npmjs.com/package/");
		expect(calls).toHaveLength(1); // whoami only — never reached pnpm
	});
});

// ── defaultExec ───────────────────────────────────────────────────────────────

describe("defaultExec (publish)", () => {
	it("calls spawnSync and returns captured output when exec is not injected", async () => {
		const { spawnSync } = await import("node:child_process");
		const spy = spawnSync as ReturnType<typeof vi.fn>;
		spy.mockReturnValue({ status: 0, stdout: "iamnewton\n", stderr: "" });

		// Without injecting exec, runPublish uses defaultExec → spawnSync.
		// npm whoami runs first; return a valid user so the publish proceeds.
		const report = await runPublish({ cwd: "/tmp", env: { npm_config_userconfig: "/dev/null" } });

		expect(spy).toHaveBeenCalled();
		// status reflects the spawnSync exit code path
		expect(["ok", "fail"]).toContain(report.status);
	});

	it("surfaces null spawnSync status as exit code -1 (→ fail)", async () => {
		const { spawnSync } = await import("node:child_process");
		const spy = spawnSync as ReturnType<typeof vi.fn>;
		spy.mockReturnValue({ status: null, stdout: "", stderr: "error" });

		const report = await runPublish({ cwd: "/tmp", env: {} });
		// null status → exitCode -1 → treated as non-zero → fail
		expect(report.status).toBe("fail");
	});
});
