import { describe, expect, it } from "vitest";

import { COMMAND_CONTEXTS, commandsInContext, contextForCommand } from "./contexts.js";

/**
 * The full command surface, mirrored from the spec's table. If a new
 * command lands without a context entry, add it here and to
 * `COMMAND_CONTEXTS` in the same change — this test is the reminder.
 */
const EVERY_COMMAND = [
	"clone",
	"new repo",
	"new plugin",
	"upgrade node",
	"upgrade deps",
	"new token",
	"remove token",
	"list tokens",
	"export tokens",
	"export requests",
	"open requests",
	"upload coverage",
	"new github-app",
	"new tunnel",
	"new domain",
	"list projects",
	"new project",
	"close project",
	"setup project",
	"apply properties",
	"migrate issue",
	"migrate issues",
	"migrate project",
	"dev",
	"dev serve",
	"check token",
	"publish bump-versions",
	"publish tag",
	"publish package",
	"install skills",
	"remove skill",
	"update skills",
	"list skills",
	"run lint commit-msg",
	"run",
	"run ci",
	"deploy on-release",
	"deploy stage",
	"show config",
	"sync readme",
	"doctor",
	"setup",
	"list secrets",
	"new secret",
	"sync secrets",
	"new channel",
	"setup notifications",
	"link account",
	"new server",
	"sync roles",
	"cleanup posts",
	"sync specs",
	"doctor all",
	"doctor notifications",
	"doctor environments",
	"doctor project",
	"doctor github-app",
	"doctor logs",
	"doctor wiki",
	"move issues",
	"doctor dns",
	"doctor repo",
	"doctor secrets",
	"doctor tokens",
	"doctor monitoring",
	"doctor ci",
	"doctor releases",
	"probe",
	"provider",
	"reconcile project",
	"deploy",
	"deploy cleanup-preview",
	"check monitor",
	"resolve checks",
	"check resolved",
	"sync",
	"cleanup branches",
	"sync github",
	"sync issues",
	"sync ideas",
	"sync tooling",
	"sync requests",
	"new spec",
	"new issue",
];

/**
 * The verbs a command may start with (spec `tech-cli-verb-commands`, #2082; the audit of #1125): every command is a verb
 * and the object follows it. `doctor`, `probe` and `provider` are the documented exceptions (their next word is a target,
 * a provider or a plugin's own name). A new verb is a decision, so it is added here, with a line in the spec, in the same
 * change as the command.
 */
const VERBS = [
	"apply",
	"check",
	"clone",
	"close",
	"cleanup",
	"deploy",
	"dev",
	"doctor",
	"export",
	"install",
	"link",
	"list",
	"migrate",
	"move",
	"new",
	"open",
	"probe",
	"provider",
	"publish",
	"reconcile",
	"remove",
	"resolve",
	"run",
	"setup",
	"show",
	"sync",
	"update",
	"upgrade",
	"upload",
];

describe("COMMAND_CONTEXTS command shape", () => {
	const commands = Object.keys(COMMAND_CONTEXTS);

	it("starts every command with a known verb", () => {
		const unknown = commands.filter((command) => !VERBS.includes(command.split(" ")[0]!));
		expect(unknown).toEqual([]);
	});

	it("is at most a verb and an object, with no hyphenated verb (the old `sync-roles` shape)", () => {
		// `run` takes a task and an optional job (`run lint commit-msg`), so it is the one command allowed three words.
		const tooLong = commands.filter((command) => !command.startsWith("run ") && command.split(" ").length > 2);
		const hyphenatedVerb = commands.filter((command) => command.split(" ")[0]!.includes("-"));
		expect({ tooLong, hyphenatedVerb }).toEqual({ tooLong: [], hyphenatedVerb: [] });
	});

	it("lists only verbs that some command uses", () => {
		const used = new Set(commands.map((command) => command.split(" ")[0]));
		expect(VERBS.filter((verb) => !used.has(verb))).toEqual([]);
	});
});

describe("COMMAND_CONTEXTS", () => {
	it("tags every context with a valid value", () => {
		for (const ctx of Object.values(COMMAND_CONTEXTS)) {
			expect(["global", "repo-aware", "workspace"]).toContain(ctx);
		}
	});

	it("has an entry for every command on the documented surface, and no extras", () => {
		expect(Object.keys(COMMAND_CONTEXTS).sort()).toEqual([...EVERY_COMMAND].sort());
	});

	it("partitions cleanly across the three contexts", () => {
		const all = [
			...commandsInContext("global"),
			...commandsInContext("repo-aware"),
			...commandsInContext("workspace"),
		];
		expect(new Set(all).size).toBe(all.length);
		expect(all.length).toBe(Object.keys(COMMAND_CONTEXTS).length);
	});

	it("keeps the plugin-dependent commands in `workspace`", () => {
		for (const cmd of [
			"sync",
			"setup",
			"doctor",
			"sync secrets",
			"deploy",
			"deploy cleanup-preview",
			"new secret",
			"check monitor",
			"resolve checks",
			"new channel",
			"setup notifications",
			"link account",
			"new server",
			"sync roles",
			"cleanup posts",
			"sync specs",
			"list projects",
			"new project",
			"close project",
			"setup project",
			"doctor all",
			"doctor notifications",
			"doctor environments",
			"doctor project",
			"doctor github-app",
			"doctor logs",
			"doctor wiki",
			"move issues",
			"doctor dns",
			"doctor repo",
			"doctor secrets",
			"doctor tokens",
			"doctor monitoring",
		]) {
			expect(contextForCommand(cmd)).toBe("workspace");
		}
	});

	it("keeps the plugin-free commands out of `workspace`", () => {
		for (const cmd of [
			"clone",
			"new repo",
			"run",
			"run ci",
			"deploy on-release",
			"deploy stage",
			"show config",
			"doctor ci",
			"new token",
			"check token",
			"check resolved",
		]) {
			expect(contextForCommand(cmd)).not.toBe("workspace");
		}
	});
});

describe("contextForCommand", () => {
	it("resolves an exact multi-token key", () => {
		expect(contextForCommand("upgrade node")).toBe("global");
		expect(contextForCommand("sync secrets")).toBe("workspace");
	});

	it("keeps a more specific key over its parent (deploy vs deploy on-release, run vs run ci)", () => {
		expect(contextForCommand("deploy")).toBe("workspace");
		expect(contextForCommand("deploy on-release")).toBe("repo-aware");
		expect(contextForCommand("run")).toBe("repo-aware");
		expect(contextForCommand("run lint commit-msg")).toBe("global");
	});

	it("falls back to the longest known prefix for an unlisted sub-command or step", () => {
		expect(contextForCommand("sync labels")).toBe("workspace");
		expect(contextForCommand("sync readme extra")).toBe("repo-aware");
		expect(contextForCommand("run audit performance")).toBe("repo-aware");
	});

	it("returns undefined for a bare group or an unknown command", () => {
		expect(contextForCommand("skills whatever")).toBeUndefined();
		expect(contextForCommand("repo")).toBeUndefined();
		expect(contextForCommand("teleport")).toBeUndefined();
		expect(contextForCommand("")).toBeUndefined();
	});
});
