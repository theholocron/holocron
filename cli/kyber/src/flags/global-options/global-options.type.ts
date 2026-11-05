/** The options {@link addGlobalOptions} declares, as a command handler receives them. */
export interface GlobalArgs {
	/** `--dry-run`: print what would change instead of changing it. */
	dryRun: boolean;
	/** `--token`, repeated: a bare value, or `vendor=value`; see `parseTokenArgs`. */
	token?: string[];
	/** `--cwd`: the directory the command works from. */
	cwd: string;
}

/** What {@link addGlobalOptions} can be told. */
export interface GlobalOptionsOptions {
	/** The help text of each option, where the tool's meaning differs from the general one. */
	describe?: Partial<Record<"dryRun" | "token" | "cwd", string>>;
	/** The default for `--cwd`. Default `process.cwd()`, read when the options are declared. */
	cwd?: string;
}
