import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { RuntimeContext } from "../../plugin/index.js";

// ── shared exec ──────────────────────────────────────────────────────────────

export type ExecFn = (cmd: string, args: string[], opts: { cwd: string }) => { exitCode: number };

// ── install ──────────────────────────────────────────────────────────────────

export interface RunSkillsInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	print?: (line: string) => void;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
}

// ── list ─────────────────────────────────────────────────────────────────────

export interface RunSkillsListInput {
	context: RuntimeContext;
	print?: (line: string) => void;
	/** Names of the directories in a folder; defaults to reading the disk. A missing folder is an empty list. */
	readDir?: (dir: string) => string[];
}

export interface SkillsListReport {
	status: "ok";
	/** Installed skill names, sorted. */
	skills: string[];
}

// ── remove ───────────────────────────────────────────────────────────────────

export interface RunSkillsRemoveInput {
	context: RuntimeContext;
	/** Skill name(s) to remove. Omit to remove all installed skills. */
	names?: string[];
	exec?: ExecFn;
	logger?: Logger;
}

export interface SkillsRemoveReport {
	status: "ok" | "fail" | "dry-run";
}

// ── update ───────────────────────────────────────────────────────────────────

export interface RunSkillsUpdateInput {
	context: RuntimeContext;
	/** When given, update only this skill. Omit to update all. */
	name?: string;
	exec?: ExecFn;
	logger?: Logger;
}

export interface SkillsUpdateReport {
	status: "ok" | "fail" | "dry-run";
}
