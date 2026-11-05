/** How {@link launchMenu} is bound to one particular CLI. */
export interface LaunchMenuConfig {
	/** The CLI's binary name, used in the default non-interactive hint (`Run \`<bin> --help\` …`). */
	bin: string;
	/**
	 * Upper-case prefix of the env vars the menu hands a spawned child: secret options travel as
	 * `<envPrefix>_<OPTION>` and a dry-run preview is flagged with `<envPrefix>_DRY_RUN_PREVIEW`.
	 */
	envPrefix: string;
	/** The question shown at the first level. Defaults to the picker's own default. */
	pickMessage?: string;
	/** The error shown when stdin is not a TTY. Defaults to ``Run `<bin> --help` to see available commands.`` */
	nonInteractiveMessage?: string;
	/** The group to open first, as words (`["repo"]`); `[]` (the default) opens the top level. */
	startPath?: string[];
}
