export interface DiscordClientOptions {
	/** Override base URL for testing. Defaults to https://discord.com/api/v10. */
	baseUrl?: string;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
}

export const DEFAULT_BASE_URL = "https://discord.com/api/v10";
