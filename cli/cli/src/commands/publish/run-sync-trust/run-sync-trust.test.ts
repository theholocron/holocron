import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn(() => ({ status: 0, stdout: "", stderr: "" })) }));

import { eotp, makeQueueExec, makeTempMonorepo, ok } from "../../../testing/publish-fixtures.js";
import { runSyncTrust } from "./run-sync-trust.js";

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
		const { exec, calls } = makeQueueExec([
			ok(JSON.stringify({ id: "x", file: "delivery.publish.yml", repository: "theholocron/holocron" })),
		]);
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

	it("treats a successful read with empty output as no trust config and creates", async () => {
		const { exec, calls } = makeQueueExec([ok(""), ok()]);
		const report = await runSyncTrust({
			cwd: "/tmp",
			oldFile: "release.yml",
			newFile: "delivery.publish.yml",
			packages: ["@theholocron/foo"],
			exec,
		});
		expect(report.packages).toEqual([{ name: "@theholocron/foo", status: "ok" }]);
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

	it("re-registers a package on the same file but bound to another repo (#1221)", async () => {
		const { exec, calls } = makeQueueExec([
			ok(JSON.stringify({ id: "utils-id", file: "delivery.publish.yml", repository: "theholocron/utils" })),
			ok(), // revoke
			ok(), // create
		]);
		const lines: string[] = [];
		const report = await runSyncTrust({
			cwd: "/tmp",
			oldFile: "delivery.publish.yml",
			newFile: "delivery.publish.yml",
			packages: ["@theholocron/env-utils"],
			print: (l) => lines.push(l),
			exec,
		});
		expect(report.packages).toEqual([{ name: "@theholocron/env-utils", status: "ok" }]);
		expect(calls[1]?.args).toEqual(expect.arrayContaining(["trust", "revoke", "--id", "utils-id"]));
		expect(calls[2]?.args).toEqual(expect.arrayContaining(["trust", "github", "--repo", "theholocron/holocron"]));
		expect(lines.join("\n")).toContain("repo=theholocron/utils, file=delivery.publish.yml");
	});

	it("compares the repository case-insensitively", async () => {
		const { exec, calls } = makeQueueExec([
			ok(JSON.stringify({ id: "x", file: "delivery.publish.yml", repository: "TheHolocron/Holocron" })),
		]);
		const report = await runSyncTrust({
			cwd: "/tmp",
			oldFile: "release.yml",
			newFile: "delivery.publish.yml",
			packages: ["@theholocron/foo"],
			exec,
		});
		expect(report.packages).toEqual([{ name: "@theholocron/foo", status: "skipped" }]);
		expect(calls).toHaveLength(1);
	});

	it("re-registers when the entry names no repository, since a match cannot be proven", async () => {
		const { exec } = makeQueueExec([ok(JSON.stringify({ id: "x", file: "delivery.publish.yml" })), ok(), ok()]);
		const report = await runSyncTrust({
			cwd: "/tmp",
			oldFile: "release.yml",
			newFile: "delivery.publish.yml",
			packages: ["@theholocron/foo"],
			exec,
		});
		expect(report.packages).toEqual([{ name: "@theholocron/foo", status: "ok" }]);
	});

	it("honours --repo when comparing the bound repository", async () => {
		const { exec, calls } = makeQueueExec([
			ok(JSON.stringify({ id: "x", file: "delivery.publish.yml", repository: "theholocron/utils" })),
		]);
		const report = await runSyncTrust({
			cwd: "/tmp",
			oldFile: "release.yml",
			newFile: "delivery.publish.yml",
			repo: "theholocron/utils",
			packages: ["@theholocron/foo"],
			exec,
		});
		expect(report.packages).toEqual([{ name: "@theholocron/foo", status: "skipped" }]);
		expect(calls).toHaveLength(1);
	});

	it("fails a package whose trust list read fails (non-EOTP) without revoking or creating, and continues", async () => {
		const { exec, calls } = makeQueueExec([
			{ exitCode: 1, stdout: JSON.stringify({ error: { code: "E401" } }), stderr: "401 Unauthorized" },
			{ exitCode: 1, stdout: "", stderr: "" },
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
			{ name: "@theholocron/foo", status: "fail", message: "401 Unauthorized" },
			{ name: "@theholocron/bar", status: "fail", message: "exit 1" },
		]);
		expect(calls).toHaveLength(2); // two lists, no revoke or create
	});

	it("falls back to stdout for the message of a failed read with no stderr", async () => {
		const { exec } = makeQueueExec([{ exitCode: 1, stdout: "boom", stderr: "" }]);
		const report = await runSyncTrust({
			cwd: "/tmp",
			oldFile: "release.yml",
			newFile: "delivery.publish.yml",
			packages: ["@theholocron/foo"],
			exec,
		});
		expect(report.packages).toEqual([{ name: "@theholocron/foo", status: "fail", message: "boom" }]);
	});

	describe("--dry-run", () => {
		it("reads each package and reports skip / recreate / create without any write", async () => {
			const { exec, calls } = makeQueueExec([
				ok(JSON.stringify({ id: "a", file: "delivery.publish.yml", repository: "theholocron/holocron" })),
				ok(JSON.stringify({ id: "b", file: "delivery.publish.yml", repository: "theholocron/utils" })),
				ok(JSON.stringify({ id: "c", file: "release.yml", repository: "theholocron/holocron" })),
				ok("{}"),
			]);
			const lines: string[] = [];
			const report = await runSyncTrust({
				cwd: "/tmp",
				oldFile: "release.yml",
				newFile: "delivery.publish.yml",
				packages: ["@t/skip", "@t/other-repo", "@t/other-file", "@t/none"],
				dryRun: true,
				print: (l) => lines.push(l),
				exec,
			});
			expect(report.status).toBe("dry-run");
			expect(report.packages.map((r) => r.status)).toEqual([
				"would-skip",
				"would-sync",
				"would-sync",
				"would-sync",
			]);
			expect(calls.every((c) => c.args.includes("list"))).toBe(true);
			const out = lines.join("\n");
			expect(out).toContain("already on theholocron/holocron / delivery.publish.yml, skipping");
			expect(out).toContain(
				"would revoke (repo=theholocron/utils, file=delivery.publish.yml, id=b) and create theholocron/holocron / delivery.publish.yml"
			);
			expect(out).toContain("would revoke (repo=theholocron/holocron, file=release.yml, id=c)");
			expect(out).toContain(
				"would create theholocron/holocron / delivery.publish.yml (no existing trust config)"
			);
		});

		it("stops at the first EOTP on a read and prints the authUrl", async () => {
			const { exec, calls } = makeQueueExec([eotp("https://www.npmjs.com/auth/cli/dry")]);
			const lines: string[] = [];
			const report = await runSyncTrust({
				cwd: "/tmp",
				oldFile: "release.yml",
				newFile: "delivery.publish.yml",
				packages: ["@theholocron/foo", "@theholocron/bar"],
				dryRun: true,
				print: (l) => lines.push(l),
				exec,
			});
			expect(report.status).toBe("fail");
			expect(report.packages).toEqual([
				{ name: "@theholocron/foo", status: "needs-auth", message: "https://www.npmjs.com/auth/cli/dry" },
			]);
			expect(lines.join("\n")).toContain(
				"needs fresh 2FA — open and approve: https://www.npmjs.com/auth/cli/dry"
			);
			expect(calls).toHaveLength(1);
		});

		it("reports fail when a read fails", async () => {
			const { exec } = makeQueueExec([{ exitCode: 1, stdout: "", stderr: "nope" }]);
			const report = await runSyncTrust({
				cwd: "/tmp",
				oldFile: "release.yml",
				newFile: "delivery.publish.yml",
				packages: ["@theholocron/foo"],
				dryRun: true,
				exec,
			});
			expect(report.status).toBe("fail");
			expect(report.message).toBe("1 package(s) failed");
		});
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
			stdout: JSON.stringify({ id: "x", file: "delivery.publish.yml", repository: "theholocron/holocron" }),
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
		const { exec, calls } = makeQueueExec([
			ok(JSON.stringify({ id: "x", file: "delivery.publish.yml", repository: "theholocron/holocron" })),
		]);

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
