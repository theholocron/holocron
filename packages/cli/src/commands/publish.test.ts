import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn(() => ({ status: 0, stdout: "", stderr: "" })) }));

import { fakeLogger } from "@theholocron/observability/testing";

import {
	type PublicPackageEntry,
	type PublishExecResult,
	runPublish,
	runSteadyPublish,
	runSyncTrust,
} from "./publish.js";

function makeTempMonorepo(
	packages: Array<{ name: string; version?: string; private?: boolean; invalidJson?: boolean }>
) {
	const root = mkdtempSync(join(tmpdir(), "holocron-test-"));
	const pkgsDir = join(root, "packages");
	mkdirSync(pkgsDir);
	for (const pkg of packages) {
		const dir = join(pkgsDir, pkg.name.replace(/\//g, "-"));
		mkdirSync(dir);
		const content = pkg.invalidJson
			? "not valid json {"
			: JSON.stringify({
					name: pkg.name,
					version: pkg.version ?? "1.0.0",
					...(pkg.private ? { private: true } : {}),
				});
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
		expect(joined).toContain("Workflow: delivery.publish.yml");
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

// ── runSteadyPublish ────────────────────────────────────────────────────────

const STEADY_ENTRIES: readonly PublicPackageEntry[] = [
	{ name: "@theholocron/foo", version: "1.0.0", dir: "./packages/foo" },
	{ name: "@theholocron/bar", version: "2.0.0", dir: "./packages/bar" },
];

describe("runSteadyPublish", () => {
	it("fails with no packages, without calling exec", async () => {
		const { exec, calls } = makeExec({});
		const report = await runSteadyPublish({ cwd: "/tmp/test", env: baseEnv, packages: [], print: () => {}, exec });
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/nothing to publish/);
		expect(calls).toHaveLength(0);
	});

	it("bulk-publishes a monorepo with -r --filter=./packages/* and --provenance by default", async () => {
		const root = makeTempMonorepo([{ name: "@theholocron/public-a" }]);
		const { exec, calls } = makeExec({ pnpm: { exitCode: 0, stdout: "", stderr: "" } });
		const report = await runSteadyPublish({ cwd: root, env: baseEnv, print: () => {}, exec });
		expect(report.status).toBe("ok");
		expect(calls[0]?.cmd).toBe("pnpm");
		expect(calls[0]?.args).toEqual([
			"-r",
			"--filter=./packages/*",
			"publish",
			"--access",
			"public",
			"--no-git-checks",
			"--tag",
			"latest",
			"--provenance",
		]);
	});

	it("skips an invalid-JSON package.json when discovering entries", async () => {
		const root = makeTempMonorepo([{ name: "@theholocron/good" }, { name: "@theholocron/bad", invalidJson: true }]);
		const { exec, calls } = makeExec({ pnpm: { exitCode: 0, stdout: "", stderr: "" } });
		const report = await runSteadyPublish({ cwd: root, env: baseEnv, print: () => {}, exec });
		expect(report.status).toBe("ok");
		expect(report.packageNames).toEqual(["@theholocron/good"]);
		expect(calls[0]?.args).toContain("-r");
	});

	it("bulk-publishes a single-package repo without -r --filter", async () => {
		const root = mkdtempSync(join(tmpdir(), "holocron-test-"));
		writeFileSync(join(root, "package.json"), JSON.stringify({ name: "@theholocron/solo", version: "1.0.0" }));
		const { exec, calls } = makeExec({ pnpm: { exitCode: 0, stdout: "", stderr: "" } });
		const report = await runSteadyPublish({ cwd: root, env: baseEnv, print: () => {}, exec });
		expect(report.status).toBe("ok");
		expect(calls[0]?.args).not.toContain("-r");
		expect(calls[0]?.args).not.toContain("--filter=./packages/*");
	});

	it("omits --provenance when provenance: false", async () => {
		const { exec, calls } = makeExec({ pnpm: { exitCode: 0, stdout: "", stderr: "" } });
		await runSteadyPublish({
			cwd: "/tmp/test",
			env: baseEnv,
			packages: STEADY_ENTRIES,
			provenance: false,
			print: () => {},
			exec,
		});
		expect(calls[0]?.args).not.toContain("--provenance");
	});

	it("passes --tag and --otp through to the bulk publish call", async () => {
		const { exec, calls } = makeExec({ pnpm: { exitCode: 0, stdout: "", stderr: "" } });
		await runSteadyPublish({
			cwd: "/tmp/test",
			env: baseEnv,
			packages: STEADY_ENTRIES,
			tag: "next",
			otp: "123456",
			print: () => {},
			exec,
		});
		expect(calls[0]?.args).toContain("next");
		expect(calls[0]?.args).toEqual(expect.arrayContaining(["--otp", "123456"]));
	});

	it("fails and prints an --otp hint on an EOTP bulk-publish failure", async () => {
		const lines: string[] = [];
		const { exec } = makeExec({ pnpm: { exitCode: 1, stdout: "", stderr: "EOTP: 2FA required" } });
		const report = await runSteadyPublish({
			cwd: "/tmp/test",
			env: baseEnv,
			packages: STEADY_ENTRIES,
			print: (l) => lines.push(l),
			exec,
		});
		expect(report.status).toBe("fail");
		expect(lines.join("\n")).toMatch(/--otp <6-digit-code>/);
	});

	it("fails with the pnpm stderr on a non-EOTP bulk-publish failure", async () => {
		const { exec } = makeExec({ pnpm: { exitCode: 1, stdout: "", stderr: "network error" } });
		const report = await runSteadyPublish({
			cwd: "/tmp/test",
			env: baseEnv,
			packages: STEADY_ENTRIES,
			print: () => {},
			exec,
		});
		expect(report.status).toBe("fail");
		expect(report.message).toContain("network error");
	});

	it("dry-run prints the would-run pnpm command without calling exec", async () => {
		const lines: string[] = [];
		const { exec, calls } = makeExec({});
		const report = await runSteadyPublish({
			cwd: "/tmp/test",
			env: baseEnv,
			packages: STEADY_ENTRIES,
			dryRun: true,
			print: (l) => lines.push(l),
			exec,
		});
		expect(report.status).toBe("dry-run");
		expect(calls).toHaveLength(0);
		expect(lines.join("\n")).toContain("would run: pnpm");
	});

	describe("skipAlreadyPublished", () => {
		it("skips a package whose exact version is already on npm, publishes the rest", async () => {
			const calls: Array<{ cmd: string; args: string[] }> = [];
			const exec = async (cmd: string, args: string[]): Promise<PublishExecResult> => {
				calls.push({ cmd, args: [...args] });
				if (cmd === "npm" && args[1] === "@theholocron/foo@1.0.0") {
					return { exitCode: 0, stdout: "1.0.0\n", stderr: "" }; // already published
				}
				if (cmd === "npm") return { exitCode: 1, stdout: "", stderr: "404" }; // not found — publish it
				return { exitCode: 0, stdout: "", stderr: "" };
			};
			const report = await runSteadyPublish({
				cwd: "/tmp/test",
				env: baseEnv,
				packages: STEADY_ENTRIES,
				skipAlreadyPublished: true,
				print: () => {},
				exec,
			});
			expect(report.status).toBe("ok");
			const pnpmCalls = calls.filter((c) => c.cmd === "pnpm");
			expect(pnpmCalls).toHaveLength(1);
			expect(pnpmCalls[0]?.args).toEqual(expect.arrayContaining(["--filter", "./packages/bar"]));
		});

		it("fails on the first per-package publish failure, without attempting the rest", async () => {
			const calls: Array<{ cmd: string; args: string[] }> = [];
			const exec = async (cmd: string, args: string[]): Promise<PublishExecResult> => {
				calls.push({ cmd, args: [...args] });
				if (cmd === "npm") return { exitCode: 1, stdout: "", stderr: "404" };
				return { exitCode: 1, stdout: "", stderr: "publish blew up" };
			};
			const report = await runSteadyPublish({
				cwd: "/tmp/test",
				env: baseEnv,
				packages: STEADY_ENTRIES,
				skipAlreadyPublished: true,
				print: () => {},
				exec,
			});
			expect(report.status).toBe("fail");
			expect(report.message).toContain("@theholocron/foo@1.0.0");
			expect(calls.filter((c) => c.cmd === "pnpm")).toHaveLength(1); // stopped after the first failure
		});

		it("dry-run lists each would-check package without calling exec", async () => {
			const lines: string[] = [];
			const { exec, calls } = makeExec({});
			const report = await runSteadyPublish({
				cwd: "/tmp/test",
				env: baseEnv,
				packages: STEADY_ENTRIES,
				skipAlreadyPublished: true,
				dryRun: true,
				print: (l) => lines.push(l),
				exec,
			});
			expect(report.status).toBe("dry-run");
			expect(calls).toHaveLength(0);
			expect(lines.join("\n")).toContain("would check @theholocron/foo@1.0.0");
			expect(lines.join("\n")).toContain("would check @theholocron/bar@2.0.0");
		});
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

/** Queue-based exec mock — each call consumes the next queued response, matched by call index. */
function makeQueueExec(responses: PublishExecResult[]) {
	let i = 0;
	const calls: Array<{ cmd: string; args: string[] }> = [];
	const exec = async (cmd: string, args: string[]): Promise<PublishExecResult> => {
		calls.push({ cmd, args: [...args] });
		const next = responses[i] ?? { exitCode: 0, stdout: "{}", stderr: "" };
		i += 1;
		return next;
	};
	return { exec, calls };
}

const ok = (stdout = "{}"): PublishExecResult => ({ exitCode: 0, stdout, stderr: "" });
const eotp = (authUrl = "https://www.npmjs.com/auth/cli/test-id"): PublishExecResult => ({
	exitCode: 1,
	stdout: JSON.stringify({ error: { code: "EOTP", authUrl } }),
	stderr: "",
});

describe("runSyncTrust", () => {
	it("revokes the old trust config and creates a new one for a package with an existing config", async () => {
		const { exec, calls } = makeQueueExec([
			ok(JSON.stringify({ id: "old-id", file: "release.yml" })), // list
			ok(), // revoke
			ok(), // create
		]);
		const report = await runSyncTrust({
			cwd: "/tmp",
			oldFile: "release.yml",
			newFile: "delivery.publish.yml",
			packages: ["@theholocron/foo"],
			exec,
		});
		expect(report.status).toBe("ok");
		expect(report.packages).toEqual([{ name: "@theholocron/foo", status: "ok" }]);
		expect(calls[1]?.args).toEqual(
			expect.arrayContaining(["trust", "revoke", "@theholocron/foo", "--id", "old-id", "-y"])
		);
		expect(calls[2]?.args).toEqual(expect.arrayContaining(["trust", "github", "@theholocron/foo"]));
	});

	it("skips a package already on the target file, without revoking or creating", async () => {
		const { exec, calls } = makeQueueExec([ok(JSON.stringify({ id: "x", file: "delivery.publish.yml" }))]);
		const report = await runSyncTrust({
			cwd: "/tmp",
			oldFile: "release.yml",
			newFile: "delivery.publish.yml",
			packages: ["@theholocron/foo"],
			exec,
		});
		expect(report.status).toBe("ok");
		expect(report.packages).toEqual([{ name: "@theholocron/foo", status: "skipped" }]);
		expect(calls).toHaveLength(1); // only the list call
	});

	it("creates directly (no revoke) when a package has no existing trust config", async () => {
		const { exec, calls } = makeQueueExec([
			ok("{}"), // list — no id, no file
			ok(), // create
		]);
		const report = await runSyncTrust({
			cwd: "/tmp",
			oldFile: "release.yml",
			newFile: "delivery.publish.yml",
			packages: ["@theholocron/foo"],
			exec,
		});
		expect(report.status).toBe("ok");
		expect(calls).toHaveLength(2);
		expect(calls[1]?.args).toEqual(expect.arrayContaining(["trust", "github"]));
	});

	it("stops immediately and reports needs-auth when EOTP is hit on the list call", async () => {
		const { exec, calls } = makeQueueExec([eotp("https://www.npmjs.com/auth/cli/abc")]);
		const report = await runSyncTrust({
			cwd: "/tmp",
			oldFile: "release.yml",
			newFile: "delivery.publish.yml",
			packages: ["@theholocron/foo", "@theholocron/bar"],
			exec,
		});
		expect(report.status).toBe("fail");
		expect(report.packages).toEqual([
			{ name: "@theholocron/foo", status: "needs-auth", message: "https://www.npmjs.com/auth/cli/abc" },
		]);
		expect(calls).toHaveLength(1); // never reaches @theholocron/bar
	});

	it("stops and reports needs-auth when EOTP is hit on the revoke call", async () => {
		const { exec, calls } = makeQueueExec([
			ok(JSON.stringify({ id: "old-id", file: "release.yml" })), // list — existing config
			eotp("https://www.npmjs.com/auth/cli/revoke-eotp"), // revoke hits EOTP
		]);
		const report = await runSyncTrust({
			cwd: "/tmp",
			oldFile: "release.yml",
			newFile: "delivery.publish.yml",
			packages: ["@theholocron/foo"],
			exec,
		});
		expect(report.status).toBe("fail");
		expect(report.packages[0]?.message).toBe("https://www.npmjs.com/auth/cli/revoke-eotp");
		expect(calls).toHaveLength(2); // never reaches the create call
	});

	it("stops and reports needs-auth when EOTP is hit on the create call", async () => {
		const { exec } = makeQueueExec([
			ok("{}"), // list — nothing existing
			eotp("https://www.npmjs.com/auth/cli/xyz"), // create hits EOTP
		]);
		const report = await runSyncTrust({
			cwd: "/tmp",
			oldFile: "release.yml",
			newFile: "delivery.publish.yml",
			packages: ["@theholocron/foo"],
			exec,
		});
		expect(report.status).toBe("fail");
		expect(report.packages[0]?.message).toBe("https://www.npmjs.com/auth/cli/xyz");
	});

	it("marks a genuinely failed (non-EOTP) create as fail and continues to the next package", async () => {
		const { exec } = makeQueueExec([
			ok("{}"),
			{ exitCode: 1, stdout: "not json", stderr: "some real error" }, // create fails, not EOTP
			ok("{}"),
			ok(),
		]);
		const report = await runSyncTrust({
			cwd: "/tmp",
			oldFile: "release.yml",
			newFile: "delivery.publish.yml",
			packages: ["@theholocron/foo", "@theholocron/bar"],
			exec,
		});
		expect(report.status).toBe("fail");
		expect(report.packages).toEqual([
			{ name: "@theholocron/foo", status: "fail", message: "some real error" },
			{ name: "@theholocron/bar", status: "ok" },
		]);
	});

	it("dry-run makes no exec calls", async () => {
		const { exec, calls } = makeQueueExec([]);
		const report = await runSyncTrust({
			cwd: "/tmp",
			oldFile: "release.yml",
			newFile: "delivery.publish.yml",
			packages: ["@theholocron/foo"],
			dryRun: true,
			exec,
		});
		expect(report.status).toBe("dry-run");
		expect(calls).toHaveLength(0);
	});

	it("fails with a clear message when there are no packages to sync", async () => {
		const { exec } = makeQueueExec([]);
		const report = await runSyncTrust({
			cwd: "/tmp",
			oldFile: "release.yml",
			newFile: "delivery.publish.yml",
			packages: [],
			exec,
		});
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/nothing to sync/);
	});

	it("defaults cwd to process.cwd() when omitted", async () => {
		// packages: [] short-circuits before any filesystem work, so the
		// `input.cwd ?? process.cwd()` default is exercised harmlessly.
		const report = await runSyncTrust({
			oldFile: "release.yml",
			newFile: "delivery.publish.yml",
			packages: [],
		});
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/nothing to sync/);
	});

	it("defaults exec to spawnSync (defaultExec) when omitted", async () => {
		const { spawnSync } = await import("node:child_process");
		const spy = spawnSync as ReturnType<typeof vi.fn>;
		spy.mockReturnValue({
			status: 0,
			stdout: JSON.stringify({ id: "x", file: "delivery.publish.yml" }),
			stderr: "",
		});

		const report = await runSyncTrust({
			cwd: "/tmp",
			oldFile: "release.yml",
			newFile: "delivery.publish.yml",
			packages: ["@theholocron/foo"],
		});

		expect(spy).toHaveBeenCalled();
		expect(report.status).toBe("ok");
		expect(report.packages).toEqual([{ name: "@theholocron/foo", status: "skipped" }]);
	});

	it("defaults packages to discoverPublicPackages(cwd) when omitted", async () => {
		const root = makeTempMonorepo([{ name: "@theholocron/public-a" }]);
		const { exec, calls } = makeQueueExec([ok(JSON.stringify({ id: "x", file: "delivery.publish.yml" }))]);

		const report = await runSyncTrust({
			cwd: root,
			oldFile: "release.yml",
			newFile: "delivery.publish.yml",
			exec,
		});

		expect(report.packages).toEqual([{ name: "@theholocron/public-a", status: "skipped" }]);
		expect(calls[0]?.args).toEqual(expect.arrayContaining(["@theholocron/public-a"]));
	});

	it("falls back to '?' when an existing trust entry has an id but no file", async () => {
		const { exec, calls } = makeQueueExec([
			ok(JSON.stringify({ id: "old-id" })), // list — id present, file absent
			ok(), // revoke
			ok(), // create
		]);
		const lines: string[] = [];
		const report = await runSyncTrust({
			cwd: "/tmp",
			oldFile: "release.yml",
			newFile: "delivery.publish.yml",
			packages: ["@theholocron/foo"],
			print: (l) => lines.push(l),
			exec,
		});
		expect(report.packages).toEqual([{ name: "@theholocron/foo", status: "ok" }]);
		expect(lines.join("\n")).toContain("file=?, id=old-id");
		expect(calls[1]?.args).toEqual(expect.arrayContaining(["--id", "old-id"]));
	});

	it("falls back to an empty authUrl when the list-call EOTP response omits it", async () => {
		const { exec } = makeQueueExec([
			{ exitCode: 1, stdout: JSON.stringify({ error: { code: "EOTP" } }), stderr: "" },
		]);
		const report = await runSyncTrust({
			cwd: "/tmp",
			oldFile: "release.yml",
			newFile: "delivery.publish.yml",
			packages: ["@theholocron/foo"],
			exec,
		});
		expect(report.packages).toEqual([{ name: "@theholocron/foo", status: "needs-auth", message: "" }]);
	});

	it("falls back to an empty authUrl when the revoke-call EOTP response omits it", async () => {
		const { exec } = makeQueueExec([
			ok(JSON.stringify({ id: "old-id", file: "release.yml" })),
			{ exitCode: 1, stdout: JSON.stringify({ error: { code: "EOTP" } }), stderr: "" },
		]);
		const report = await runSyncTrust({
			cwd: "/tmp",
			oldFile: "release.yml",
			newFile: "delivery.publish.yml",
			packages: ["@theholocron/foo"],
			exec,
		});
		expect(report.packages).toEqual([{ name: "@theholocron/foo", status: "needs-auth", message: "" }]);
	});

	it("falls back to an empty authUrl when the create-call EOTP response omits it", async () => {
		const { exec } = makeQueueExec([
			ok("{}"),
			{ exitCode: 1, stdout: JSON.stringify({ error: { code: "EOTP" } }), stderr: "" },
		]);
		const report = await runSyncTrust({
			cwd: "/tmp",
			oldFile: "release.yml",
			newFile: "delivery.publish.yml",
			packages: ["@theholocron/foo"],
			exec,
		});
		expect(report.packages).toEqual([{ name: "@theholocron/foo", status: "needs-auth", message: "" }]);
	});

	it("falls back to the exit-code message when a failed create has no stderr or stdout", async () => {
		const { exec } = makeQueueExec([ok("{}"), { exitCode: 7, stdout: "", stderr: "" }]);
		const report = await runSyncTrust({
			cwd: "/tmp",
			oldFile: "release.yml",
			newFile: "delivery.publish.yml",
			packages: ["@theholocron/foo"],
			exec,
		});
		expect(report.packages).toEqual([{ name: "@theholocron/foo", status: "fail", message: "exit 7" }]);
	});
});
