import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import notifyAction from "../actions/notify/action.yml";

const hasJq = spawnSync("jq", ["--version"]).status === 0;

/** The action's `run:` block, dedented -- the real script, not a copy of it. */
function script(): string {
	const m = /run: \|\n([\s\S]*?)\n {6}env:/.exec(notifyAction);
	if (!m) throw new Error("could not find the run block in notify.yml");
	return m[1]!
		.split("\n")
		.map((l) => l.replace(/^ {8}/, ""))
		.join("\n");
}

const dirs: string[] = [];
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Run the script with a fake `curl` that answers with `status` and records the request body. */
function run(env: Record<string, string>, status = "204") {
	const dir = mkdtempSync(join(tmpdir(), "notify-"));
	dirs.push(dir);
	const sent = join(dir, "body.json");
	writeFileSync(
		join(dir, "curl"),
		`#!/bin/bash\nwhile [ $# -gt 0 ]; do [ "$1" = "-d" ] && printf '%s' "$2" > "${sent}"; shift; done\nprintf '%s' "${status}"\n`
	);
	chmodSync(join(dir, "curl"), 0o755);
	const r = spawnSync("bash", ["-c", script()], {
		env: {
			PATH: `${dir}:${process.env["PATH"]}`,
			USERNAME: "Holocron",
			MESSAGE: "hello",
			MENTION: "",
			STRICT: "false",
			WEBHOOK: "",
			...env,
		},
		encoding: "utf8",
		// No stdin: with a piped stdin and a minimal environment some bashes write
		// terminal noise instead of running the script.
		stdio: ["ignore", "pipe", "pipe"],
	});
	let body: Record<string, unknown> | undefined;
	try {
		body = JSON.parse(readFileSync(sent, "utf8")) as Record<string, unknown>;
	} catch {
		body = undefined;
	}
	return { code: r.status, out: `${r.stdout}${r.stderr}`, body };
}

describe("notify action", () => {
	it("declares a strict input that defaults to off", () => {
		expect(notifyAction).toMatch(/strict:\n\s+description:[\s\S]*?default: "false"/);
	});
});

describe.skipIf(!hasJq)("notify action script", () => {
	it("skips quietly, and succeeds, when no webhook is set", () => {
		const r = run({});
		expect(r.code).toBe(0);
		expect(r.out).toContain("::notice::No notification webhook set");
		expect(r.body).toBeUndefined();
	});

	it("strict: fails when no webhook is set", () => {
		const r = run({ STRICT: "true" });
		expect(r.code).toBe(1);
		expect(r.out).toContain("::error::No notification webhook set");
	});

	it("posts the message, with mentions disabled, and succeeds on 204", () => {
		const r = run({ WEBHOOK: "https://hook.test/x", MESSAGE: "hi @everyone" }, "204");
		expect(r.code).toBe(0);
		expect(r.out).toContain("Notification posted.");
		expect(r.body).toMatchObject({
			content: "hi @everyone",
			username: "Holocron",
			allowed_mentions: { parse: [], roles: [] },
		});
	});

	it("pings only the one numeric role id it is given", () => {
		const r = run({ WEBHOOK: "https://hook.test/x", MENTION: "1562979974502424668" });
		expect(r.body).toMatchObject({
			content: "<@&1562979974502424668> hello",
			allowed_mentions: { parse: [], roles: ["1562979974502424668"] },
		});
		const bad = run({ WEBHOOK: "https://hook.test/x", MENTION: "<@&1>everyone" });
		expect(bad.body).toMatchObject({ content: "hello", allowed_mentions: { roles: [] } });
	});

	it("strict: a mention that is not a role id fails, instead of being dropped and passing", () => {
		const r = run({ WEBHOOK: "https://hook.test/x", STRICT: "true", MENTION: "<@&1>everyone" });
		expect(r.code).toBe(1);
		expect(r.out).toContain("::error::The mention is not a role id");
		expect(r.body).toBeUndefined();
	});

	it("strict: no mention at all is fine", () => {
		expect(run({ WEBHOOK: "https://hook.test/x", STRICT: "true" }).code).toBe(0);
	});

	it("a rejected post is only a warning by default", () => {
		const r = run({ WEBHOOK: "https://hook.test/x" }, "404");
		expect(r.code).toBe(0);
		expect(r.out).toContain("::warning::Notification failed (HTTP 404)");
	});

	it("strict: a rejected post fails the step", () => {
		const r = run({ WEBHOOK: "https://hook.test/x", STRICT: "true" }, "404");
		expect(r.code).toBe(1);
		expect(r.out).toContain("::error::Notification failed (HTTP 404)");
	});

	it("truncates to Discord's 2000-character limit", () => {
		const r = run({ WEBHOOK: "https://hook.test/x", MESSAGE: "x".repeat(2500) });
		expect(String(r.body?.["content"])).toHaveLength(2000);
	});
});
