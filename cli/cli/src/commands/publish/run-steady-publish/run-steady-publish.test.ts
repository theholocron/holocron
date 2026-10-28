import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn(() => ({ status: 0, stdout: "", stderr: "" })) }));

import {
	baseEnv,
	makeExec,
	makeTempMonorepo,
	makeTempMonorepoWithPlugins,
	makeTempWorkspace,
} from "../../../testing/publish-fixtures.js";
import type { PublicPackageEntry } from "../public-package-entry.type.js";
import type { PublishExecResult } from "../publish.type.js";
import { runSteadyPublish } from "./run-steady-publish.js";

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

	it("bulk-publishes plugins/* alongside packages/* and discovers their entries (holocron#993 regression)", async () => {
		const root = makeTempMonorepoWithPlugins(
			[{ name: "@theholocron/cli", version: "1.0.0" }],
			[{ name: "@theholocron/holocron-plugin-axiom", version: "2.0.0" }]
		);
		const { exec, calls } = makeExec({ pnpm: { exitCode: 0, stdout: "", stderr: "" } });
		const report = await runSteadyPublish({ cwd: root, env: baseEnv, print: () => {}, exec });
		expect(report.status).toBe("ok");
		expect(report.packageNames).toEqual(
			expect.arrayContaining(["@theholocron/cli", "@theholocron/holocron-plugin-axiom"])
		);
		expect(calls[0]?.args).toEqual([
			"-r",
			"--filter=./packages/*",
			"--filter=./plugins/*",
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

	it("redacts the otp value in the dry-run 'would run' preview line (holocron#1076 review)", async () => {
		const lines: string[] = [];
		const { exec } = makeExec({});
		await runSteadyPublish({
			cwd: "/tmp/test",
			env: baseEnv,
			packages: STEADY_ENTRIES,
			otp: "123456",
			dryRun: true,
			print: (l) => lines.push(l),
			exec,
		});
		const joined = lines.join("\n");
		expect(joined).toContain("would run");
		expect(joined).toContain("--otp");
		expect(joined).not.toContain("123456");
		expect(joined).toContain("***");
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
		it("discovers public packages from disk, leaving out private ones", async () => {
			const root = makeTempMonorepo([
				{ name: "@theholocron/pub", version: "2.0.0" },
				{ name: "@theholocron/hidden", private: true },
			]);
			const calls: Array<{ cmd: string; args: string[] }> = [];
			const exec = async (cmd: string, args: string[]): Promise<PublishExecResult> => {
				calls.push({ cmd, args: [...args] });
				return cmd === "npm"
					? { exitCode: 1, stdout: "", stderr: "404" }
					: { exitCode: 0, stdout: "", stderr: "" };
			};
			const report = await runSteadyPublish({
				cwd: root,
				env: baseEnv,
				skipAlreadyPublished: true,
				print: () => {},
				exec,
			});
			expect(report.status).toBe("ok");
			expect(calls.filter((c) => c.cmd === "npm").map((c) => c.args[1])).toEqual(["@theholocron/pub@2.0.0"]);
			expect(calls.find((c) => c.cmd === "pnpm")?.args).toEqual(
				expect.arrayContaining(["./packages/@theholocron-pub"])
			);
		});

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

		it("treats a lost race against a concurrent publish as a skip, not a failure, and continues (holocron#1076 review)", async () => {
			const lines: string[] = [];
			let viewCallsForFoo = 0;
			const calls: Array<{ cmd: string; args: string[] }> = [];
			const exec = async (cmd: string, args: string[]): Promise<PublishExecResult> => {
				calls.push({ cmd, args: [...args] });
				if (cmd === "npm" && args[1] === "@theholocron/foo@1.0.0") {
					viewCallsForFoo += 1;
					// First check (before publishing): not found yet. Second
					// check (after our own publish call failed): another
					// concurrent run already published it in the meantime.
					return viewCallsForFoo === 1
						? { exitCode: 1, stdout: "", stderr: "404" }
						: { exitCode: 0, stdout: "1.0.0\n", stderr: "" };
				}
				if (cmd === "npm") return { exitCode: 1, stdout: "", stderr: "404" };
				// pnpm publish for foo loses the race (409); bar succeeds normally.
				if (args.includes("./packages/foo")) {
					return { exitCode: 1, stdout: "", stderr: "E409 cannot publish over previously published version" };
				}
				return { exitCode: 0, stdout: "", stderr: "" };
			};
			const report = await runSteadyPublish({
				cwd: "/tmp/test",
				env: baseEnv,
				packages: STEADY_ENTRIES,
				skipAlreadyPublished: true,
				print: (l) => lines.push(l),
				exec,
			});
			expect(report.status).toBe("ok");
			expect(lines.join("\n")).toContain("published concurrently by another run");
			// both packages were still attempted -- bar wasn't skipped because of foo's race
			expect(calls.filter((c) => c.cmd === "pnpm")).toHaveLength(2);
		});

		it("falls back to the publish call's stdout when a genuine (non-race) per-package failure has empty stderr (patch coverage)", async () => {
			const exec = async (cmd: string): Promise<PublishExecResult> => {
				if (cmd === "npm") return { exitCode: 1, stdout: "", stderr: "404" }; // never published, not a race
				return { exitCode: 1, stdout: "publish blew up on stdout", stderr: "" };
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
			expect(report.message).toContain("publish blew up on stdout");
		});

		it("falls back to 'no output' when a genuine (non-race) per-package failure has empty stderr and stdout (patch coverage)", async () => {
			const exec = async (cmd: string): Promise<PublishExecResult> => {
				if (cmd === "npm") return { exitCode: 1, stdout: "", stderr: "404" }; // never published, not a race
				return { exitCode: 1, stdout: "", stderr: "" };
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
			expect(report.message).toContain("no output");
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

describe("runSteadyPublish with a version group", () => {
	const groupRepo = () =>
		makeTempWorkspace({
			"pnpm-workspace.yaml": 'packages:\n  - "clients/*"\n  - "utils/*"\n',
			"clients/http/package.json": { name: "@acme/http", version: "1.5.0" },
			"clients/github/package.json": { name: "@acme/github", version: "1.5.0" },
			"utils/array/package.json": { name: "@acme/array", version: "1.16.0" },
		});

	it("bulk-publishes only the group's workspace glob", async () => {
		const { exec, calls } = makeExec({ pnpm: { exitCode: 0, stdout: "", stderr: "" } });
		const lines: string[] = [];
		const report = await runSteadyPublish({
			cwd: groupRepo(),
			env: baseEnv,
			group: "clients",
			print: (l) => lines.push(l),
			exec,
		});
		expect(report.status).toBe("ok");
		expect(report.packageNames).toEqual(["@acme/github", "@acme/http"]);
		expect(calls[0]?.args.slice(0, 3)).toEqual(["-r", "--filter=./clients/*", "publish"]);
		expect(lines).toContain("  group: clients");
	});

	it("checks and publishes the group's packages one by one with --skip-already-published", async () => {
		const { exec, calls } = makeExec({
			npm: { exitCode: 1, stdout: "", stderr: "E404" },
			pnpm: { exitCode: 0, stdout: "", stderr: "" },
		});
		await runSteadyPublish({
			cwd: groupRepo(),
			env: baseEnv,
			group: "utils",
			skipAlreadyPublished: true,
			print: () => {},
			exec,
		});
		expect(calls.filter((c) => c.cmd === "npm").map((c) => c.args[1])).toEqual(["@acme/array@1.16.0"]);
		expect(calls.find((c) => c.cmd === "pnpm")?.args.slice(0, 2)).toEqual(["--filter", "./utils/array"]);
	});

	it("fails with nothing to publish for a group that has no packages", async () => {
		const { exec, calls } = makeExec({});
		const report = await runSteadyPublish({
			cwd: groupRepo(),
			env: baseEnv,
			group: "skills",
			print: () => {},
			exec,
		});
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/nothing to publish/);
		expect(calls).toHaveLength(0);
	});
});
