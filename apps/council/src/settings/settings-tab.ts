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

	/** Draws the fields. */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("p", {
			text:
				"Filing runs holocron sync ideas on a Mac. There is no token field: the CLI reads its tokens through its own " +
				"chain (flag, environment, .env, credential providers, keyring), and a token here would be synced to every " +
				"device with the vault.",
		});

		this.text(
			"Holocron repo path",
			"The checkout the command runs in. Start it with ~ for your home folder, so the same setting works on every Mac.",
			"repoPath",
			"~/Code/theholocron/holocron"
		);
		new Setting(this.containerEl)
			.setName("Run through my login shell")
			.setDesc(
				"Finds node and pnpm the way your terminal does, so one setting works on every Mac. It starts your shell, " +
					"which takes about 2 seconds longer. Turn it off and give full paths in Command if your shell profile " +
					"is slow or does not set up node."
			)
			.addToggle((toggle) =>
				toggle.setValue(this.host.settings.useLoginShell).onChange(async (value) => {
					this.host.settings.useLoginShell = value;
					await this.host.saveSettings();
				})
			);
		this.text(
			"Command",
			"What starts the CLI. With the login shell option on, the default works as it is. With it off, Obsidian " +
				"does not see the PATH from your shell profile, so use full paths, for example /opt/homebrew/bin/pnpm exec " +
				"holocron. A leading ~ is your home folder.",
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
			"The state that files the idea. File this idea sets it, and holocron sync ideas acts on it.",
			"fileState",
			DEFAULT_SETTINGS.fileState
		);
	}

	private text(
		name: string,
		desc: string,
		key: "repoPath" | "command" | "states" | "fileState",
		placeholder: string
	): void {
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
