/** The directory, relative to the repository root, for files that hold secrets and must never be committed. */
export const PRIVATE_DIR = ".holocron/.private";

/** The file `auth export` and `github-app create` write by default, relative to the repository root. */
export const PRIVATE_CREDENTIALS_FILE = `${PRIVATE_DIR}/.credentials`;

/** The tracked file that keeps the otherwise ignored directory in the checkout. */
export const PRIVATE_KEEP_FILE = `${PRIVATE_DIR}/.gitkeep`;

/**
 * The managed block `repo setup` and `repo sync` keep in `.gitignore`: everything in the private directory is ignored
 * except the `.gitkeep`. The start marker must not be a substring of the end marker.
 */
export const PRIVATE_IGNORE_BLOCK = {
	start: "# managed by holocron setup — private directory",
	end: "# end managed by holocron setup — private directory",
	lines: [`${PRIVATE_DIR}/*`, `!${PRIVATE_KEEP_FILE}`],
} as const;
