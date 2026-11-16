import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { formatJson } from "@theholocron/astromech";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { CLAUDE_SETTINGS_FILE, generateClaudeFiles } from "./generate-claude-files.js";
import { generateRepoFiles } from "./generate-repo-files.js";

let root: string;

function loadedFrom(options?: { dcg?: boolean }): LoadedConfig {
	return {
		resolved: resolveConfig({
			name: "x",
			providers: {},
			...(options ? { agent: ["claude", options] } : {}),
		} as Parameters<typeof resolveConfig>[0]),
		filepath: join(root, "holocron.config.json"),
	};
}

const writeSettings = (text: string) => {
	mkdirSync(join(root, ".claude"), { recursive: true });
	writeFileSync(join(root, CLAUDE_SETTINGS_FILE), text);
};

const WIRED = { hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "dcg" }] }] } };

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "claude-files-"));
	mkdirSync(join(root, ".git"));
});
afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("generateClaudeFiles", () => {
	it("writes nothing, and no step, for a repo that does not opt in", async () => {
		expect(await generateClaudeFiles({ loaded: loadedFrom(), repoRoot: root })).toEqual([]);
		expect(await generateClaudeFiles({ loaded: loadedFrom({ dcg: false }), repoRoot: root })).toEqual([]);
	});

	it("makes the file, with the hook, when there is none and the repo opts in", async () => {
		const [file] = await generateClaudeFiles({ loaded: loadedFrom({ dcg: true }), repoRoot: root });
		expect(file).toMatchObject({
			kind: "file",
			path: ".claude/settings.json",
			step: "write .claude/settings.json",
		});
		expect((file as { content: string }).content).toBe(formatJson(WIRED));
	});

	it("merges into the file that is there and keeps what a repo set", async () => {
		writeSettings(JSON.stringify({ permissions: { allow: ["Bash(pnpm test:*)"] } }));
		const [file] = await generateClaudeFiles({ loaded: loadedFrom({ dcg: true }), repoRoot: root });
		const parsed = JSON.parse((file as { content: string }).content);
		expect(parsed.permissions).toEqual({ allow: ["Bash(pnpm test:*)"] });
		expect(parsed.hooks.PreToolUse).toHaveLength(1);
	});

	it("gives the same bytes again once the file is written, so a re-run changes nothing", async () => {
		const input = { loaded: loadedFrom({ dcg: true }), repoRoot: root };
		const [first] = (await generateClaudeFiles(input)) as { content: string }[];
		writeSettings(first!.content);
		const [second] = (await generateClaudeFiles(input)) as { content: string }[];
		expect(second!.content).toBe(first!.content);
	});

	it("fails the step, and never overwrites, a file that is not JSON or cannot hold the hook", async () => {
		writeSettings("{ not json");
		const [broken] = await generateClaudeFiles({ loaded: loadedFrom({ dcg: true }), repoRoot: root });
		expect(broken).toMatchObject({ kind: "error", message: ".claude/settings.json is not valid JSON" });
		writeSettings(JSON.stringify({ hooks: [] }));
		const [shaped] = await generateClaudeFiles({ loaded: loadedFrom({ dcg: true }), repoRoot: root });
		expect(shaped).toMatchObject({ kind: "error" });
		expect((shaped as { message: string }).message).toContain("`hooks` in the settings file is not an object");
	});

	it("is part of generateRepoFiles only when the repo opts in", async () => {
		const without = await generateRepoFiles({ loaded: loadedFrom(), repoRoot: root });
		expect(without.some((e) => e.step === "write .claude/settings.json")).toBe(false);
		const withHook = await generateRepoFiles({ loaded: loadedFrom({ dcg: true }), repoRoot: root });
		expect(withHook.filter((e) => e.step === "write .claude/settings.json")).toHaveLength(1);
	});
});
