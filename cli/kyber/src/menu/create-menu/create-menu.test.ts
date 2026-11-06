import { beforeEach, describe, expect, it, vi } from "vitest";

const launch = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../launch-menu/index.js", () => ({ launchMenu: launch }));

const { createMenu } = await import("./create-menu.js");

describe("createMenu", () => {
	beforeEach(() => launch.mockClear());

	it("binds the engine to the bin and env prefix", async () => {
		const menu = createMenu({ bin: "mycli", envPrefix: "MYCLI" });
		const entries = [{ name: "doctor", description: "d", positionals: [] }];
		await menu.launchMenu(entries, { org: "o" });
		expect(launch).toHaveBeenCalledWith(entries, { org: "o" }, { bin: "mycli", envPrefix: "MYCLI" });
	});

	it("passes the optional messages and start path through", async () => {
		await createMenu({ bin: "mycli", envPrefix: "MYCLI" }).launchMenu(
			[],
			{},
			{ pickMessage: "pick:", startPath: ["repo"] }
		);
		expect(launch).toHaveBeenCalledWith(
			[],
			{},
			{ bin: "mycli", envPrefix: "MYCLI", pickMessage: "pick:", startPath: ["repo"] }
		);
	});

	it("derives the dry-run preview env var from the prefix", () => {
		expect(createMenu({ bin: "mycli", envPrefix: "MYCLI" }).dryRunPreviewEnvVar).toBe("MYCLI_DRY_RUN_PREVIEW");
	});
});
