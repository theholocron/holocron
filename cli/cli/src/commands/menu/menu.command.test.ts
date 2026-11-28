import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dir = vi.hoisted(() => ({ value: "" }));
vi.mock("node:os", async (importActual) => ({
	...(await importActual<typeof import("node:os")>()),
	tmpdir: () => dir.value,
}));
const launchMenu = vi.hoisted(() => vi.fn(async () => {}));
const listRunnableTasks = vi.hoisted(() => vi.fn(async () => ["a"]));
vi.mock("../../interactive-menu/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../interactive-menu/index.js")>()),
	launchMenu,
	listRunnableTasks,
	buildRunMenuEntries: (tasks: string[]) => tasks.map((name) => ({ name: `run ${name}` })),
}));

import { menuCommand, printVersionHeaderOnce } from "./menu.command.js";

const realTmp = (await vi.importActual<typeof import("node:os")>("node:os")).tmpdir();

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	dir.value = mkdtempSync(join(realTmp, "menu-"));
	log = vi.spyOn(console, "log").mockImplementation(() => {});
	vi.clearAllMocks();
});
afterEach(() => {
	rmSync(dir.value, { recursive: true, force: true });
	log.mockRestore();
});

describe("printVersionHeaderOnce", () => {
	it("prints the version the first time in a shell, and not again", () => {
		printVersionHeaderOnce("1.2.3");
		printVersionHeaderOnce("1.2.3");
		expect(log).toHaveBeenCalledTimes(1);
		expect(String(log.mock.calls[0]![0])).toContain("v1.2.3");
	});

	it("prints nothing when this shell has already seen it", () => {
		writeFileSync(join(dir.value, `.holocron-version-shown-${process.ppid}`), "");
		printVersionHeaderOnce("1.2.3");
		expect(log).not.toHaveBeenCalled();
	});
});

describe("menuCommand", () => {
	it("is the hidden default command", () => {
		const menu = menuCommand("1.2.3");
		expect(menu.command).toBe("$0");
		expect(menu.describe).toBe(false);
		const y = {} as never;
		expect((menu.builder as (a: never) => unknown)(y)).toBe(y);
	});

	it("opens a menu of every command, with the repo's runnable tasks merged in", async () => {
		const argv = { cwd: "/repo" };
		await (menuCommand("1.2.3").handler as (a: never) => Promise<void>)(argv as never);
		expect(listRunnableTasks).toHaveBeenCalledWith(argv);
		const [entries, passed] = launchMenu.mock.calls[0] as unknown as [Array<{ name: string }>, unknown];
		expect(passed).toBe(argv);
		expect(entries.at(-1)).toEqual({ name: "run a" });
		expect(entries.some((e) => e.name === "probe")).toBe(true);
		expect(log).toHaveBeenCalled();
	});
});
