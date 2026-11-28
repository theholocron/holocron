/** What the settings tab stores in the plugin's `data.json`. It never holds a token: iCloud would sync that file to every device. */
export interface IdeasSettings {
	/** The Holocron checkout the command runs in; a leading `~` is the home folder. Empty until the user sets it. */
	repoPath: string;
	/** The command that starts the CLI, split on spaces (quotes group words). */
	command: string;
	/** Start the command through the user's login shell, so it finds `node` and `pnpm` the way a terminal does. */
	useLoginShell: boolean;
	/** The `status` values, comma-separated, in the order the picker lists them. */
	states: string;
	/** The state that means "file this idea". */
	fileState: string;
}

/** The settings after the states text has been read: the picker's list and the filing state, which is always in it. */
export interface ParsedStates {
	states: string[];
	fileState: string;
}
