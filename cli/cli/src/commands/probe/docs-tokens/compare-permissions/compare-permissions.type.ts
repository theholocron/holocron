/** One place where a token's declared permissions and `tokens.mdx` disagree. */
export interface PermissionProblem {
	/** The token's plugin environment variable. */
	envName: string;
	/** The layer, or `any` for a problem with the table itself. */
	layer: string;
	/** The permission, or empty for a problem with the table itself. */
	permission: string;
	/** What differs. */
	detail: string;
}
