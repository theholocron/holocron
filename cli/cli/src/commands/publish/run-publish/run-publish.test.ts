import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn(() => ({ status: 0, stdout: "", stderr: "" })) }));

import { fakeLogger } from "@theholocron/observability/testing";

import {
	baseEnv,
	makeExec,
	makeTempMonorepo,
	makeTempMonorepoWithPlugins,
	makeTempPluginsOnlyRepo,
	TEST_ORG,
	TEST_PACKAGES,
	TEST_REPO,
} from "../../../testing/publish-fixtures.js";
import type { PublishExecResult } from "../publish.type.js";
import { runPublish } from "./run-publish.js";

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
			orgName: TEST_ORG,
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
			orgName: TEST_ORG,
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
			orgName: TEST_ORG,
			print: () => {},
			exec,
			login,
		});
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/npm login failed/);
		expect(calls).toHaveLength(1); // only the first whoami — never attempted publish
	});

	it("falls back to auto-discovering packageNames (no override) when `npm login` itself fails (patch coverage)", async () => {
		const { exec } = makeExec({
			npm: { exitCode: 1, stdout: "", stderr: "ENEEDAUTH" },
		});
		const login = vi.fn(async () => ({ exitCode: 1 }));
		const report = await runPublish({
			cwd: "/tmp/test",
			env: baseEnv,
			repoName: TEST_REPO,
			orgName: TEST_ORG,
			print: () => {},
			exec,
			login,
		});
		expect(report.status).toBe("fail");
		expect(report.packageNames).toEqual([]);
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
			orgName: TEST_ORG,
			print: () => {},
			exec,
			login,
		});
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/whoami.* still fails/);
	});

	it("falls back to auto-discovering packageNames (no override) when whoami still fails after login (patch coverage)", async () => {
		const { exec } = makeExec({
			npm: { exitCode: 1, stdout: "", stderr: "ENEEDAUTH" },
		});
		const login = vi.fn(async () => ({ exitCode: 0 }));
		const report = await runPublish({
			cwd: "/tmp/test",
			env: baseEnv,
			repoName: TEST_REPO,
			orgName: TEST_ORG,
			print: () => {},
			exec,
			login,
		});
		expect(report.status).toBe("fail");
		expect(report.packageNames).toEqual([]);
	});

	it("targets each package by exact name, not a directory glob, when publishing (monorepo layout)", async () => {
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
			orgName: TEST_ORG,
			print: () => {},
			exec,
		});
		expect(calls[1]?.cmd).toBe("pnpm");
		expect(calls[1]?.args).toEqual([
			"-r",
			"--filter=@theholocron/foo",
			"--filter=@theholocron/bar",
			"publish",
			"--access",
			"public",
			"--no-git-checks",
			"--tag",
			"alpha",
		]);
	});

	it("still uses -r (a monorepo invocation) when plugins/* is the dir that exists, even though the filtered names are explicit (holocron#993 regression)", async () => {
		const root = makeTempMonorepoWithPlugins(
			[{ name: "@theholocron/cli" }],
			[{ name: "@theholocron/holocron-plugin-axiom" }]
		);
		const { exec, calls } = makeExec({
			npm: { exitCode: 0, stdout: "iamnewton", stderr: "" },
			pnpm: { exitCode: 0, stdout: "", stderr: "" },
		});
		await runPublish({
			cwd: root,
			env: baseEnv,
			packages: TEST_PACKAGES,
			repoName: TEST_REPO,
			orgName: TEST_ORG,
			print: () => {},
			exec,
		});
		expect(calls[1]?.args).toEqual([
			"-r",
			"--filter=@theholocron/foo",
			"--filter=@theholocron/bar",
			"publish",
			"--access",
			"public",
			"--no-git-checks",
			"--tag",
			"alpha",
		]);
	});

	it("still uses -r for a plugins-only repo layout", async () => {
		const root = makeTempPluginsOnlyRepo([{ name: "@theholocron/holocron-plugin-axiom" }]);
		const { exec, calls } = makeExec({
			npm: { exitCode: 0, stdout: "iamnewton", stderr: "" },
			pnpm: { exitCode: 0, stdout: "", stderr: "" },
		});
		await runPublish({
			cwd: root,
			env: baseEnv,
			packages: TEST_PACKAGES,
			repoName: TEST_REPO,
			orgName: TEST_ORG,
			print: () => {},
			exec,
		});
		expect(calls[1]?.args).toEqual([
			"-r",
			"--filter=@theholocron/foo",
			"--filter=@theholocron/bar",
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
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({ name: "@theholocron/observability", version: "1.0.0" })
		);
		const calls: Array<{ cmd: string; args: string[] }> = [];
		const exec = async (cmd: string, args: string[]): Promise<PublishExecResult> => {
			calls.push({ cmd, args });
			if (cmd === "npm" && args[0] === "whoami") return { exitCode: 0, stdout: "iamnewton", stderr: "" };
			if (cmd === "npm" && args[0] === "view") return { exitCode: 1, stdout: "", stderr: "npm error code E404" };
			return { exitCode: 0, stdout: "", stderr: "" };
		};
		const report = await runPublish({
			cwd: root,
			env: baseEnv,
			repoName: TEST_REPO,
			orgName: TEST_ORG,
			print: () => {},
			exec,
		});
		expect(report.status).toBe("ok");
		expect(report.packageNames).toEqual(["@theholocron/observability"]);
		expect(calls[2]?.cmd).toBe("pnpm");
		expect(calls[2]?.args).toEqual(["publish", "--access", "public", "--no-git-checks", "--tag", "alpha"]);
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
			orgName: TEST_ORG,
			print: (l) => lines.push(l),
			exec,
		});
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/nothing to publish/);
		expect(lines.join("\n")).toMatch(/nothing to publish/);
		// never got as far as the publish call — only `npm whoami` ran
		expect(calls).toHaveLength(1);
	});

	it("excludes a package that already exists on npm from the publish (holocron#1052 follow-up)", async () => {
		const lines: string[] = [];
		const root = makeTempMonorepo([{ name: "@theholocron/old-timer" }, { name: "@theholocron/newcomer" }]);
		const calls: Array<{ cmd: string; args: string[] }> = [];
		const exec = async (cmd: string, args: string[]): Promise<PublishExecResult> => {
			calls.push({ cmd, args });
			if (cmd === "npm" && args[0] === "whoami") return { exitCode: 0, stdout: "iamnewton", stderr: "" };
			if (cmd === "npm" && args[0] === "view" && args[1] === "@theholocron/old-timer") {
				return { exitCode: 0, stdout: "1.0.0\n", stderr: "" };
			}
			if (cmd === "npm" && args[0] === "view") return { exitCode: 1, stdout: "", stderr: "npm error code E404" };
			return { exitCode: 0, stdout: "", stderr: "" };
		};
		const report = await runPublish({
			cwd: root,
			env: baseEnv,
			repoName: TEST_REPO,
			orgName: TEST_ORG,
			print: (l) => lines.push(l),
			exec,
		});
		expect(report.status).toBe("ok");
		expect(report.packageNames).toEqual(["@theholocron/newcomer"]);
		const publishCall = calls.find((c) => c.cmd === "pnpm");
		expect(publishCall?.args).toContain("--filter=@theholocron/newcomer");
		expect(publishCall?.args).not.toContain("--filter=@theholocron/old-timer");
		const joined = lines.join("\n");
		// Column-aligned against the longer name/dir pair (old-timer) — newcomer's
		// row is padded with one extra trailing space on each column to match.
		expect(joined).toContain(
			"@theholocron/old-timer  ./packages/@theholocron-old-timer  already published (v1.0.0)"
		);
		expect(joined).toContain("@theholocron/newcomer   ./packages/@theholocron-newcomer   published (v1.0.0)");
		expect(joined).not.toContain("@theholocron/old-timer/access");
		expect(joined).toContain("@theholocron/newcomer/access");
		expect(joined).toContain("1 published, 0 failed, 1 skipped");
	});

	it("treats every public package already existing on npm as an idempotent success, not a failure", async () => {
		const lines: string[] = [];
		const root = makeTempMonorepo([{ name: "@theholocron/already-there" }]);
		const exec = async (cmd: string, args: string[]): Promise<PublishExecResult> => {
			if (cmd === "npm" && args[0] === "whoami") return { exitCode: 0, stdout: "iamnewton", stderr: "" };
			if (cmd === "npm" && args[0] === "view") return { exitCode: 0, stdout: "1.0.0\n", stderr: "" };
			return { exitCode: 0, stdout: "", stderr: "" };
		};
		const report = await runPublish({
			cwd: root,
			env: baseEnv,
			repoName: TEST_REPO,
			orgName: TEST_ORG,
			print: (l) => lines.push(l),
			exec,
		});
		expect(report.status).toBe("ok");
		expect(report.packageNames).toEqual([]);
		expect(report.message).toMatch(/nothing new to bootstrap/);
		const joined = lines.join("\n");
		expect(joined).toContain("already published");
		expect(joined).toContain("0 published, 0 failed, 1 skipped");
	});

	it("skips the npm-existence check entirely when packages is explicitly overridden", async () => {
		const { exec, calls } = makeExec({
			npm: { exitCode: 0, stdout: "iamnewton", stderr: "" },
			pnpm: { exitCode: 0, stdout: "", stderr: "" },
		});
		await runPublish({
			cwd: "/tmp/test",
			env: baseEnv,
			packages: TEST_PACKAGES,
			repoName: TEST_REPO,
			orgName: TEST_ORG,
			print: () => {},
			exec,
		});
		// whoami, then straight to pnpm publish -- no "npm view" existence check
		expect(calls).toHaveLength(2);
		expect(calls[1]?.cmd).toBe("pnpm");
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
			orgName: TEST_ORG,
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
			orgName: TEST_ORG,
			print: () => {},
			exec,
		});
		expect(calls[1]?.args).toContain("next");
	});

	it("returns fail with the captured stderr when publish exits non-zero", async () => {
		const lines: string[] = [];
		const { exec } = makeExec({
			npm: { exitCode: 0, stdout: "iamnewton", stderr: "" },
			pnpm: { exitCode: 1, stdout: "", stderr: "EPUBLISHCONFLICT" },
		});
		const report = await runPublish({
			cwd: "/tmp/test",
			env: baseEnv,
			packages: TEST_PACKAGES,
			repoName: TEST_REPO,
			orgName: TEST_ORG,
			print: (l) => lines.push(l),
			exec,
		});
		expect(report.status).toBe("fail");
		expect(report.message).toContain("EPUBLISHCONFLICT");
		// Atomic bulk publish: a failure counts every targeted package as
		// failed, never a partial count (unlike clone's per-repo loop).
		expect(lines.join("\n")).toContain("0 published, 2 failed, 0 skipped");
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
			orgName: TEST_ORG,
			print: () => {},
			exec,
		});
		expect(calls[1]?.args).toContain("--otp");
		expect(calls[1]?.args).toContain("123456");
	});

	it("redacts the otp value in the dry-run 'would run' preview line (holocron#1076 review)", async () => {
		const lines: string[] = [];
		const { exec } = makeExec({
			npm: { exitCode: 0, stdout: "iamnewton", stderr: "" },
		});
		await runPublish({
			cwd: "/tmp/test",
			otp: "123456",
			dryRun: true,
			env: baseEnv,
			packages: TEST_PACKAGES,
			repoName: TEST_REPO,
			orgName: TEST_ORG,
			print: (l) => lines.push(l),
			exec,
		});
		const joined = lines.join("\n");
		expect(joined).toContain("would run");
		expect(joined).toContain("--otp");
		expect(joined).not.toContain("123456");
		expect(joined).toContain("***");
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
			orgName: TEST_ORG,
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
			orgName: TEST_ORG,
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
			orgName: TEST_ORG,
			print: (l) => lines.push(l),
			exec,
		});
		expect(report.status).toBe("dry-run");
		expect(calls).toHaveLength(1); // only whoami
		const joined = lines.join("\n");
		expect(joined).toContain("would run");
		expect(joined).toContain("dry-run: 2 published, 0 failed, 0 skipped");
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
			orgName: TEST_ORG,
			print: (l) => lines.push(l),
			exec,
		});
		const joined = lines.join("\n");
		expect(joined).toContain("2 published, 0 failed, 0 skipped");
		expect(joined).toContain("→ packages to be published:");
		expect(joined).toContain("npmjs.com/package/@theholocron/foo/access");
		expect(joined).toContain("npmjs.com/package/@theholocron/bar/access");
		expect(joined).toContain(`Organization: ${TEST_ORG}`);
		expect(joined).toContain(`Repository: ${TEST_REPO}`);
		expect(joined).toContain("Publisher: GitHub Actions");
		expect(joined).toContain("Label: Holocron Release");
		expect(joined).toContain("Workflow filename: delivery.publish.yml");
	});

	it("auto-detects org + repo from git remote when orgName/repoName are not injected", async () => {
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
		const joined = lines.join("\n");
		expect(joined).toContain("Organization: theholocron");
		expect(joined).toContain("Repository: themes");
	});

	it("auto-detects org + repo from SSH remote URL format", async () => {
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
		const joined = lines.join("\n");
		expect(joined).toContain("Organization: theholocron");
		expect(joined).toContain("Repository: clients");
	});

	it("falls back to 'unknown' for both org and repo when git remote fails", async () => {
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
		const joined = lines.join("\n");
		expect(joined).toContain("Organization: unknown");
		expect(joined).toContain("Repository: unknown");
	});

	it("resolves only the missing half from git when just one of orgName/repoName is injected", async () => {
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
			repoName: TEST_REPO,
			print: (l) => lines.push(l),
			exec,
		});
		const joined = lines.join("\n");
		expect(joined).toContain("Organization: theholocron");
		expect(joined).toContain(`Repository: ${TEST_REPO}`);
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
			orgName: TEST_ORG,
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
			orgName: TEST_ORG,
			print: (l) => lines.push(l),
			exec,
		});
		const joined = lines.join("\n");
		expect(joined).not.toContain("Revoke it now");
	});
});
