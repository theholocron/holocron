import { beforeEach, describe, expect, it, vi } from "vitest";

import { settingRows } from "../__tests__/obsidian-mock.js";
import { DEFAULT_SETTINGS } from "./default-settings.js";

vi.mock("obsidian", async () => await import("../__tests__/obsidian-mock.js"));

const { IdeasSettingTab } = await import("./settings-tab.js");

beforeEach(() => {
	settingRows.length = 0;
});

describe("IdeasSettingTab", () => {
	it("draws four fields, none of them for a token, and explains the PATH limit", () => {
		const host = { settings: { ...DEFAULT_SETTINGS }, saveSettings: vi.fn() };
		const tab = new IdeasSettingTab({} as never, host as never);
		tab.display();
		expect(settingRows.map((row) => row.name)).toEqual(["Holocron repo path", "Command", "States", "Filing state"]);
		expect(settingRows.map((row) => row.name?.toLowerCase()).join(" ")).not.toContain("token");
		expect(settingRows[1]?.desc).toContain("PATH");
		expect(settingRows[1]?.input?.value).toBe("pnpm exec holocron");
	});

	it("saves a changed value", async () => {
		const host = { settings: { ...DEFAULT_SETTINGS }, saveSettings: vi.fn(() => Promise.resolve()) };
		new IdeasSettingTab({} as never, host as never).display();
		await settingRows[0]?.input?.onChange?.("/repo");
		expect(host.settings.repoPath).toBe("/repo");
		expect(host.saveSettings).toHaveBeenCalledOnce();
	});
});
