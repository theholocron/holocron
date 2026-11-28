import { beforeEach, describe, expect, it, vi } from "vitest";

import { settingRows } from "../__tests__/obsidian-mock.js";
import { DEFAULT_SETTINGS } from "./default-settings.js";

vi.mock("obsidian", async () => await import("../__tests__/obsidian-mock.js"));

const { IdeasSettingTab } = await import("./settings-tab.js");

beforeEach(() => {
	settingRows.length = 0;
});

describe("IdeasSettingTab", () => {
	it("draws the fields, none of them for a token, and explains the shell option", () => {
		const host = { settings: { ...DEFAULT_SETTINGS }, saveSettings: vi.fn() };
		const tab = new IdeasSettingTab({} as never, host as never);
		tab.display();
		expect(settingRows.map((row) => row.name)).toEqual([
			"Holocron repo path",
			"Run through my login shell",
			"Command",
			"States",
			"Filing state",
		]);
		expect(settingRows.map((row) => row.name?.toLowerCase()).join(" ")).not.toContain("token");
		expect(settingRows[0]?.input?.placeholder).toBe("~/Code/theholocron/holocron");
		expect(settingRows[1]?.desc).toContain("about 2 seconds");
		expect(settingRows[1]?.toggle?.value).toBe(true);
		expect(settingRows[2]?.desc).toContain("PATH");
		expect(settingRows[2]?.input?.value).toBe("pnpm exec holocron");
	});

	it("saves a changed value", async () => {
		const host = { settings: { ...DEFAULT_SETTINGS }, saveSettings: vi.fn(() => Promise.resolve()) };
		new IdeasSettingTab({} as never, host as never).display();
		await settingRows[0]?.input?.onChange?.("/repo");
		expect(host.settings.repoPath).toBe("/repo");
		expect(host.saveSettings).toHaveBeenCalledOnce();
	});

	it("shows the toggle off when the saved setting is off, and saves true when it is turned on", async () => {
		const host = {
			settings: { ...DEFAULT_SETTINGS, useLoginShell: false },
			saveSettings: vi.fn(() => Promise.resolve()),
		};
		new IdeasSettingTab({} as never, host as never).display();
		expect(settingRows[1]?.toggle?.value).toBe(false);
		await settingRows[1]?.toggle?.onChange?.(true);
		expect(host.settings.useLoginShell).toBe(true);
		expect(host.saveSettings).toHaveBeenCalledOnce();
	});

	it("saves the shell toggle", async () => {
		const host = { settings: { ...DEFAULT_SETTINGS }, saveSettings: vi.fn(() => Promise.resolve()) };
		new IdeasSettingTab({} as never, host as never).display();
		await settingRows[1]?.toggle?.onChange?.(false);
		expect(host.settings.useLoginShell).toBe(false);
		expect(host.saveSettings).toHaveBeenCalledOnce();
	});
});
