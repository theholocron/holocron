import { type App, type Plugin, PluginSettingTab, Setting } from "obsidian";

import { DEFAULT_SETTINGS } from "./default-settings.js";
import type { IdeasSettings } from "./settings.type.js";

/** The plugin as the settings tab sees it: the settings object it edits and how to save it. */
export interface SettingsHost extends Plugin {
	settings: IdeasSettings;
	saveSettings: () => Promise<void>;
}

/**
 * The settings tab. There is no field for a token and there never should be: `data.json` is a file in the vault, which
 * iCloud syncs to every device. The CLI reads its tokens through its own chain on the Mac.
 */
export class IdeasSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly host: SettingsHost
	) {
		super(app, host);
	}

	/** Draws the four fields. */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("p", {
			text:
				"Filing runs holocron ideas sync on a Mac. There is no token field: the CLI reads its tokens through its own " +
				"chain (flag, environment, .env, credential providers, keyring), and a token here would be synced to every " +
				"device with the vault.",
		});

		this.text(
			"Holocron repo path",
			"The checkout the command runs in, as an absolute path.",
			"repoPath",
			"/Users/you/Code/holocron"
		);
		this.text(
			"Command",
			"What starts the CLI. Obsidian is a GUI app and may not see the PATH from your shell profile, so use the full " +
				'path to the program if "pnpm" or "node" is not found, for example /opt/homebrew/bin/pnpm exec holocron.',
			"command",
			DEFAULT_SETTINGS.command
		);
		this.text(
			"States",
			"The status values the picker offers, separated by commas. They must match the ideas block of holocron.config.",
			"states",
			DEFAULT_SETTINGS.states
		);
		this.text(
			"Filing state",
			"The state that files the idea. File this idea sets it, and holocron ideas sync acts on it.",
			"fileState",
			DEFAULT_SETTINGS.fileState
		);
	}

	private text(name: string, desc: string, key: keyof IdeasSettings, placeholder: string): void {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc)
			.addText((input) =>
				input
					.setPlaceholder(placeholder)
					.setValue(this.host.settings[key])
					.onChange(async (value) => {
						this.host.settings[key] = value;
						await this.host.saveSettings();
					})
			);
	}
}
