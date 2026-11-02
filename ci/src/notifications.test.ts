import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const hasJq = spawnSync("jq", ["--version"]).status === 0;

const workflow = readFileSync(new URL("../../.github/workflows/platform.notifications.yml", import.meta.url), "utf8");

/** The `failed` job's "Word the message" script, dedented -- the real script, not a copy of it. */
function script(): string {
	const m = /id: message\n {8}run: \|\n([\s\S]*?)\n\n/.exec(workflow);
	if (!m) throw new Error("could not find the message step in platform.notifications.yml");
	return m[1]!
		.split("\n")
		.map((l) => l.replace(/^ {10}/, ""))
		.join("\n");
}

const dirs: string[] = [];
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

interface Job {
	name: string;
	conclusion: string;
	html_url: string;
}

const job = (name: string, conclusion = "failure", n = 1): Job => ({
	name,
	conclusion,
	html_url: `https://github.com/o/r/actions/runs/9/job/${n}`,
});

/** Run the script with a fake `gh` that answers with `reply` (or fails) and records the endpoint it was asked for. */
function run(reply: string | null, attempt = "1") {
	const dir = mkdtempSync(join(tmpdir(), "notifications-"));
	dirs.push(dir);
	const out = join(dir, "output");
	const asked = join(dir, "asked");
	writeFileSync(join(dir, "reply.json"), reply ?? "");
	writeFileSync(
		join(dir, "gh"),
		`#!/bin/bash\nprintf '%s' "$2" > "${asked}"\n${reply === null ? "exit 1" : `cat "${join(dir, "reply.json")}"`}\n`
	);
	chmodSync(join(dir, "gh"), 0o755);
	writeFileSync(out, "");
	const r = spawnSync("bash", ["-e", "-o", "pipefail", "-c", script()], {
		env: {
			PATH: `${dir}:${process.env["PATH"]}`,
			GITHUB_REPOSITORY: "o/r",
			GITHUB_OUTPUT: out,
			WORKFLOW: "Delivery",
			FILE: ".github/workflows/delivery.publish.yml",
			BRANCH: "alpha",
			URL: "https://github.com/o/r/actions/runs/9",
			ATTEMPT: attempt,
			RUN_ID: "9",
		},
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	const raw = readFileSync(out, "utf8");
	const text = /^text<<HOLOCRON_EOF\n([\s\S]*)\nHOLOCRON_EOF\n$/.exec(raw)?.[1];
	return { code: r.status, text, asked: readFileSync(asked, "utf8") };
}

const jobs = (list: Job[]) => JSON.stringify({ total_count: list.length, jobs: list });
const line = "❌ o/r: Delivery (delivery.publish.yml) failed on alpha — https://github.com/o/r/actions/runs/9";

describe("platform.notifications.yml", () => {
	it("grants actions: read to the failed-run job, and to no other job or the workflow", () => {
		expect(workflow).toMatch(/^permissions: \{\}$/m);
		expect(workflow.match(/actions: read/g)).toHaveLength(2); // the header comment and the job
		expect(/ {4}permissions:\n {6}actions: read\n {4}env:/.exec(workflow)).not.toBeNull();
	});
});

describe.skipIf(!hasJq)("failed-run message", () => {
	it("names the one failing job, with a link", () => {
		const r = run(jobs([job("Build"), job("Lint", "success", 2)]));
		expect(r.code).toBe(0);
		expect(r.text).toBe(`${line}\nFailed jobs:\n• [Build](<https://github.com/o/r/actions/runs/9/job/1>)`);
		expect(r.asked).toBe("repos/o/r/actions/runs/9/attempts/1/jobs?per_page=100");
	});

	it("names several, counting a timed-out job and skipping cancelled and skipped ones", () => {
		const r = run(
			jobs([
				job("A"),
				job("B", "timed_out", 2),
				job("C", "cancelled", 3),
				job("D", "skipped", 4),
				job("E", "failure", 5),
			])
		);
		expect(r.text).toContain("• [A](");
		expect(r.text).toContain("• [B](");
		expect(r.text).toContain("• [E](");
		expect(r.text).not.toContain("[C]");
		expect(r.text).not.toContain("[D]");
		expect(r.text).not.toContain("more");
	});

	it("names five and says how many more beyond that", () => {
		const r = run(jobs(Array.from({ length: 8 }, (_, i) => job(`J${i}`, "failure", i))));
		expect(r.text!.match(/^• /gm)).toHaveLength(5);
		expect(r.text).toContain("[J4]");
		expect(r.text).not.toContain("[J5]");
		expect(r.text!.endsWith("\nand 3 more")).toBe(true);
	});

	it("shows exactly five with no 'more' line", () => {
		const r = run(jobs(Array.from({ length: 5 }, (_, i) => job(`J${i}`))));
		expect(r.text!.match(/^• /gm)).toHaveLength(5);
		expect(r.text).not.toContain("more");
	});

	it("falls back to today's message when no job is found", () => {
		expect(run(jobs([job("Lint", "success")])).text).toBe(line);
		expect(run(jobs([])).text).toBe(line);
	});

	it("falls back to today's message when the jobs cannot be read", () => {
		const failed = run(null);
		expect(failed.code).toBe(0);
		expect(failed.text).toBe(line);
		expect(run("<html>not json</html>").text).toBe(line);
	});

	it("asks for the attempt that failed and says so on a rerun", () => {
		const r = run(jobs([job("Build")]), "3");
		expect(r.asked).toBe("repos/o/r/actions/runs/9/attempts/3/jobs?per_page=100");
		expect(r.text!.startsWith(`${line} (attempt 3)\nFailed jobs:`)).toBe(true);
	});

	it("keeps a long or odd name from breaking the link, and the post inside Discord's 2000 characters", () => {
		const odd = run(jobs([job("a [b](c)\nd\re")]));
		expect(odd.text).toContain("• [a  b (c) d e](<");
		const long = run(jobs(Array.from({ length: 9 }, (_, i) => job("x".repeat(300), "failure", i))));
		expect(long.text!.match(/^• \[x{80}\]\(</gm)).toHaveLength(5);
		expect(long.text!.length).toBeLessThan(1900);
	});
});
