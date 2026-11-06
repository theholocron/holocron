import { beforeEach, describe, expect, it, vi } from "vitest";

const launchKyberMenu = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@theholocron/kyber/menu", async (importActual) => ({
	...(await importActual<typeof import("@theholocron/kyber/menu")>()),
	launchMenu: launchKyberMenu,
}));

const { DRY_RUN_NOOP_EXIT_CODE, DRY_RUN_PREVIEW_ENV_VAR, launchMenu } = await import("./launch-menu.js");

describe("launchMenu", () => {
	beforeEach(() => launchKyberMenu.mockClear());

	it("binds kyber's engine to the holocron bin and HOLOCRON_ env prefix", async () => {
		const entries = [{ name: "doctor", description: "d", positionals: [] }];
		await launchMenu(entries, { org: "o" });
		expect(launchKyberMenu).toHaveBeenCalledWith(entries, { org: "o" }, { bin: "holocron", envPrefix: "HOLOCRON" });
	});

	it("passes the optional messages and start path through", async () => {
		await launchMenu([], {}, "pick:", "no tty", ["repo"]);
		expect(launchKyberMenu).toHaveBeenCalledWith(
			[],
			{},
			{
				bin: "holocron",
				envPrefix: "HOLOCRON",
				pickMessage: "pick:",
				nonInteractiveMessage: "no tty",
				startPath: ["repo"],
			}
		);
	});

	it("keeps the HOLOCRON_DRY_RUN_PREVIEW env var and the no-op exit code the handlers rely on", () => {
		expect(DRY_RUN_PREVIEW_ENV_VAR).toBe("HOLOCRON_DRY_RUN_PREVIEW");
		expect(DRY_RUN_NOOP_EXIT_CODE).toBe(2);
	});
});
