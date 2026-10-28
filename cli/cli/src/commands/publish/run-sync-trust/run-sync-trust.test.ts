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
