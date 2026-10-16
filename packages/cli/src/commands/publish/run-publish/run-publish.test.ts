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

	it("includes --filter=./plugins/* alongside --filter=./packages/* when both dirs exist (holocron#993 regression)", async () => {
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
			print: () => {},
			exec,
		});
		expect(calls[1]?.args).toEqual([
			"-r",
			"--filter=./packages/*",
			"--filter=./plugins/*",
			"publish",
			"--access",
			"public",
			"--no-git-checks",
			"--tag",
			"alpha",
		]);
	});

	it("filters on --filter=./plugins/* alone for a plugins-only repo layout", async () => {
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
			print: () => {},
			exec,
		});
		expect(calls[1]?.args).toEqual([
			"-r",
			"--filter=./plugins/*",
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
