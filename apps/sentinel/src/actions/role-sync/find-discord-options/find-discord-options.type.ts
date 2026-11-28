/** The Discord provider's options from a config, or why the config has none. */
export type FindDiscordOptionsResult = { ok: true; options: Record<string, unknown> } | { ok: false; reason: string };
