export interface ParsedTokenArgs {
	/** Set when a bare (unkeyed) --token value was passed. Used as fallback for all plugins. */
	cliToken?: string;
	/** Set when one or more vendor=value pairs were passed. */
	cliTokens?: Record<string, string>;
}
