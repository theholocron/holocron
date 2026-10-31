import { describe, expect, it } from "vitest";

import { COMMAND_REGISTRY } from "../command-registry/index.js";
import { menuItems } from "../menu-items/index.js";

describe("menuItems — one level of the nested menu", () => {
	const names = (path: string[] = []) => menuItems(COMMAND_REGISTRY, path).map((i) => i.name);
	const valueOf = (name: string, path: string[] = []) =>
		menuItems(COMMAND_REGISTRY, path).find((i) => i.name === name)?.value;

	it("the top level shows one row per first word, with groups opening a submenu", () => {
		expect(valueOf("repo ›")).toBe("group:repo");
		expect(valueOf("auth ›")).toBe("group:auth");
		expect(valueOf("doctor ›")).toBe("group:doctor");
		expect(names()).not.toContain("doctor"); // only the group, never a second runnable row
	});

	it("marks `probe` with the chevron, though it is a runnable command and not a group, and does not preview it", () => {
		expect(valueOf("probe ›")).toBe("probe");
		expect(COMMAND_REGISTRY.find((e) => e.name === "probe")?.supportsDryRun).toBeFalsy();
	});

	it("keeps plain `doctor` runnable, as the first item of its own submenu", () => {
		expect(names(["doctor"])).toEqual([
			"doctor (run it)",
			"doctor (everything)",
			"notifications",
			"environments",
			"secrets",
			"tokens",
			"variables",
		]);
		expect(valueOf("doctor (run it)", ["doctor"])).toBe("doctor");
		expect(valueOf("doctor (everything)", ["doctor"])).toBe("doctor all");
		expect(valueOf("notifications", ["doctor"])).toBe("doctor notifications");
	});

	it("never shows a `<command> <subcommand>` path: every row at every level is one word", () => {
		const rows: string[] = [];
		const walk = (path: string[]): void => {
			for (const item of menuItems(COMMAND_REGISTRY, path)) {
				rows.push(item.name);
				if (item.value.startsWith("group:")) walk(item.value.slice("group:".length).split(" "));
			}
		};
		walk([]);
		const bad = rows.filter((n) =>
			n
				.replace(/ ›$/, "")
				.replace(/ \((run it|everything)\)$/, "")
				.includes(" ")
		);
		expect(bad).toEqual([]);
	});

	it("does not collapse a one-command group: `config show` is config › then show", () => {
		expect(names()).toContain("config ›");
		expect(names()).not.toContain("config show");
		expect(names(["config"])).toEqual(["show"]);
		expect(valueOf("show", ["config"])).toBe("config show");
		expect(names(["sync"])).toEqual(["github"]);
		expect(valueOf("ci", ["run"])).toBe("run ci");
	});

	it("shows the next word under a group, and nests as deep as the names go", () => {
		expect(names(["repo"])).toEqual(["setup", "sync ›", "cleanup ›", "upgrade ›"]);
		expect(valueOf("setup", ["repo"])).toBe("repo setup");
		expect(valueOf("upgrade ›", ["repo"])).toBe("group:repo upgrade");
		expect(names(["repo", "upgrade"])).toEqual(["node", "deps"]);
		expect(valueOf("node", ["repo", "upgrade"])).toBe("repo upgrade node");
	});

	it("a group that is also runnable gets a leading `<word> (run it)` item (repo sync, deploy)", () => {
		const sync = menuItems(COMMAND_REGISTRY, ["repo", "sync"]);
		expect(sync[0]).toMatchObject({ name: "sync (run it)", value: "repo sync" });
		expect(sync.map((i) => i.value)).toContain("repo sync readme");
		const deploy = menuItems(COMMAND_REGISTRY, ["deploy"]);
		expect(deploy[0]).toMatchObject({ name: "deploy (run it)", value: "deploy" });
		expect(deploy.map((i) => i.value)).toEqual(["deploy", "deploy cleanup-preview", "deploy on-release"]);
	});

	it("run has no bare entry in the static registry — just `ci` until cli.ts merges in the dynamic task entries", () => {
		const run = menuItems(COMMAND_REGISTRY, ["run"]);
		expect(run.map((i) => i.value)).toEqual(["run ci"]);
	});

	it("a group's description lists its children, and its haystack covers everything under it", () => {
		const repo = menuItems(COMMAND_REGISTRY).find((i) => i.value === "group:repo")!;
		expect(repo.description).toBe("setup, sync, cleanup, upgrade");
		expect(repo.haystack).toContain("repo upgrade node");
	});

	it("reaches every registered command exactly once by walking the tree", () => {
		const reached: string[] = [];
		const walk = (path: string[]): void => {
			for (const item of menuItems(COMMAND_REGISTRY, path)) {
				if (item.value.startsWith("group:")) walk(item.value.slice("group:".length).split(" "));
				else reached.push(item.value);
			}
		};
		walk([]);
		expect([...reached].sort()).toEqual(COMMAND_REGISTRY.map((e) => e.name).sort());
	});
});
