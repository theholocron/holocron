import { describe, expect, it } from "vitest";

import { ENTRIES } from "../__tests__/fixtures.js";
import { BACK, GROUP, menuItems } from "./menu-items.js";

describe("menuItems — one level of the nested menu", () => {
	const names = (path: string[] = []) => menuItems(ENTRIES, path).map((i) => i.name);
	const valueOf = (name: string, path: string[] = []) => menuItems(ENTRIES, path).find((i) => i.name === name)?.value;

	it("exposes the group prefix and the back value", () => {
		expect(GROUP).toBe("group:");
		expect(BACK).toBe("back");
	});

	it("the top level shows one row per first word, with groups opening a submenu", () => {
		expect(valueOf("repo ›")).toBe("group:repo");
		expect(valueOf("doctor ›")).toBe("group:doctor");
		expect(valueOf("deploy ›")).toBe("group:deploy");
		expect(names()).not.toContain("doctor"); // only the group, never a second runnable row
	});

	it("marks an `opensMenu` leaf with the chevron, though it is a runnable command and not a group", () => {
		expect(valueOf("probe ›")).toBe("probe");
	});

	it("keeps a plain runnable group head runnable, as the first item of its own submenu", () => {
		expect(names(["doctor"])).toEqual(["doctor (run it)", "doctor (everything)", "dns"]);
		expect(valueOf("doctor (run it)", ["doctor"])).toBe("doctor");
		expect(valueOf("doctor (everything)", ["doctor"])).toBe("doctor all");
		expect(valueOf("dns", ["doctor"])).toBe("doctor dns");
	});

	it("never shows a `<command> <subcommand>` path: every row at every level is one word", () => {
		const rows: string[] = [];
		const walk = (path: string[]): void => {
			for (const item of menuItems(ENTRIES, path)) {
				rows.push(item.name);
				if (item.value.startsWith(GROUP)) walk(item.value.slice(GROUP.length).split(" "));
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
		expect(valueOf("ci", ["run"])).toBe("run ci");
	});

	it("shows the next word under a group, and nests as deep as the names go", () => {
		expect(names(["repo"])).toEqual(["setup", "sync ›", "upgrade ›"]);
		expect(valueOf("setup", ["repo"])).toBe("repo setup");
		expect(valueOf("upgrade ›", ["repo"])).toBe("group:repo upgrade");
		expect(names(["repo", "upgrade"])).toEqual(["node", "deps"]);
		expect(valueOf("node", ["repo", "upgrade"])).toBe("repo upgrade node");
	});

	it("a group that is also runnable gets a leading `<word> (run it)` item", () => {
		const sync = menuItems(ENTRIES, ["repo", "sync"]);
		expect(sync[0]).toMatchObject({ name: "sync (run it)", value: "repo sync" });
		expect(sync.map((i) => i.value)).toContain("repo sync readme");
		const deploy = menuItems(ENTRIES, ["deploy"]);
		expect(deploy[0]).toMatchObject({ name: "deploy (run it)", value: "deploy" });
		expect(deploy.map((i) => i.value)).toEqual(["deploy", "deploy on-release"]);
	});

	it("a group's description lists its children, and its haystack covers everything under it", () => {
		const repo = menuItems(ENTRIES).find((i) => i.value === "group:repo")!;
		expect(repo.description).toBe("setup, sync, upgrade");
		expect(repo.haystack).toContain("repo upgrade node");
	});

	it("reaches every entry exactly once by walking the tree", () => {
		const reached: string[] = [];
		const walk = (path: string[]): void => {
			for (const item of menuItems(ENTRIES, path)) {
				if (item.value.startsWith(GROUP)) walk(item.value.slice(GROUP.length).split(" "));
				else reached.push(item.value);
			}
		};
		walk([]);
		expect([...reached].sort()).toEqual(ENTRIES.map((e) => e.name).sort());
	});
});
