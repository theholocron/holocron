import { describe, expect, it, vi } from "vitest";

const launch = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../interactive-menu/index.js", () => ({ COMMAND_REGISTRY: ["registry"], launchMenu: launch }));

import { launchGroupMenu } from "./group-menu.js";

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
});
