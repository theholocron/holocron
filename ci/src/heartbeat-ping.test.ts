import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { WORKFLOWS } from "./index.js";

/** The scheduled workflows that ping a Checkly heartbeat (#2359), by task id, with the secret each reads. */
const PINGS = {
	"check-tokens": "HOLOCRON_HEARTBEAT_CHECK_TOKENS",
	"doctor-tokens": "HOLOCRON_HEARTBEAT_DOCTOR_TOKENS",
	"sync-specs": "HOLOCRON_HEARTBEAT_SYNC_SPECS",
	"reconcile-projects": "HOLOCRON_HEARTBEAT_RECONCILE_PROJECTS",
	"reconcile-ci": "HOLOCRON_HEARTBEAT_RECONCILE_CI",
} as const;

const PING_STEP = /- name: Ping the heartbeat\n([\s\S]*?)(?=\n {6}- |\n[^\s]|$)/;

/** The text of a workflow's ping step. */
function pingStep(id: string): string {
	const m = PING_STEP.exec(WORKFLOWS[id] ?? "");
	if (!m) throw new Error(`${id} has no "Ping the heartbeat" step`);
	return m[1]!;
}

/** The step's `run:` block, dedented: the real script, not a copy of it. */
function script(id: string): string {
	const m = /run: \|\n([\s\S]*)$/.exec(pingStep(id));
	if (!m) throw new Error(`${id}: no run block`);
	return m[1]!
		.split("\n")
		.map((l) => l.replace(/^ {10}/, ""))
		.join("\n");
}

const dirs: string[] = [];
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Runs the script with a fake `curl` that records its arguments and exits with `curlStatus`. */
function run(id: string, url: string, curlStatus = 0) {
	const dir = mkdtempSync(join(tmpdir(), "heartbeat-"));
	dirs.push(dir);
	const args = join(dir, "args.txt");
	writeFileSync(join(dir, "curl"), `#!/bin/bash\nprintf '%s\\n' "$@" > "${args}"\nexit ${curlStatus}\n`);
	chmodSync(join(dir, "curl"), 0o755);
	const r = spawnSync("bash", ["-c", script(id)], {
		env: { PATH: `${dir}:${process.env["PATH"]}`, PING_URL: url },
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	return { ...r, args: existsSync(args) ? readFileSync(args, "utf8") : undefined };
}

describe.each(Object.entries(PINGS))("%s pings its heartbeat", (id, secret) => {
	it("passes the URL through env only, from its own secret, and declares the secret", () => {
		const step = pingStep(id);
		expect(step).toContain(`PING_URL: \${{ secrets.${secret} }}`);
		expect(WORKFLOWS[id]).toContain(`      ${secret}:\n        description:`);
		// The secret is never interpolated into the script text, where it would be printed in the log.
		expect(script(id)).not.toContain("${{");
	});

	it("is the last step, so only a run that got that far pings", () => {
		const text = WORKFLOWS[id]!;
		expect(text.lastIndexOf("- name: Ping the heartbeat")).toBeGreaterThan(text.lastIndexOf("- uses:"));
		expect(text.lastIndexOf("- name:")).toBe(text.lastIndexOf("- name: Ping the heartbeat"));
	});

	it("does nothing, with a notice, when the secret is not set", () => {
		const r = run(id, "");
		expect(r.status).toBe(0);
		expect(r.args).toBeUndefined();
		expect(r.stdout).toContain(`::notice::${secret} is not set`);
	});

	it("requests the URL with a retry and a time limit, masks it and never prints it", () => {
		const url = "https://ping.checklyhq.com/very-secret-token";
		const r = run(id, url);
		expect(r.status).toBe(0);
		expect(r.args?.split("\n")).toEqual(["-fsS", "--retry", "3", "--max-time", "10", "-o", "/dev/null", url, ""]);
		expect(r.stdout).toContain(`::add-mask::${url}`);
		expect(r.stdout.replace(`::add-mask::${url}`, "")).not.toContain("very-secret-token");
	});

	it("does not fail the job when the ping fails", () => {
		const r = run(id, "https://ping.checklyhq.com/x", 22);
		expect(r.status).toBe(0);
		expect(r.stdout).toContain("::warning::The heartbeat ping failed.");
	});
});

describe("sync-specs", () => {
	it("does not ping a dry run or a run that did nothing for want of a Discord token", () => {
		const m = /name: Ping the heartbeat\n\s+if: ([^\n]+)/.exec(WORKFLOWS["sync-specs"]!);
		expect(m?.[1]).toBe("env.HOLOCRON_DISCORD_BOT_TOKEN != '' && env.DRY_RUN != 'true'");
	});
});
