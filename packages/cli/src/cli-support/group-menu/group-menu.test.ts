import { describe, expect, it, vi } from "vitest";

const launch = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../interactive-menu/index.js", () => ({ COMMAND_REGISTRY: ["registry"], launchMenu: launch }));

import { groupMenu, launchGroupMenu } from "./group-menu.js";

describe("launchGroupMenu", () => {
	it("opens the menu at that group, with a message and a fallback that name it", async () => {
		const argv = { cwd: "/x" };
		await launchGroupMenu("repo upgrade", argv);
		expect(launch).toHaveBeenCalledWith(
			["registry"],
			argv,
			"repo upgrade — choose a subcommand:",
			"Run `holocron repo upgrade --help` to see available repo upgrade subcommands.",
			["repo", "upgrade"]
		);
	});

	it("is a hidden `$0` command that opens the menu at its group", async () => {
		const menu = groupMenu("secrets");
		expect(menu.command).toBe("$0");
		expect(menu.describe).toBe(false);
		const y = {} as never;
		expect((menu.builder as (a: never) => unknown)(y)).toBe(y);
		launch.mockClear();
		await (menu.handler as (a: never) => Promise<void>)({ cwd: "/x" } as never);
		expect(launch).toHaveBeenCalledWith(
			["registry"],
			{ cwd: "/x" },
			"secrets — choose a subcommand:",
			expect.any(String),
			["secrets"]
		);
	});
});
