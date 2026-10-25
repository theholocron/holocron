import { readFile, writeFile } from "node:fs/promises";

import type { GuildIdWrite } from "./notifications-create-server.type.js";

const GUILD_ID = /(["']?guildId["']?\s*:\s*)(["'])(\d{1,20})\2/g;

/**
 * Puts a new server id where the config names the old one. It changes a file the person wrote, so it only does
 * so when there is exactly one `guildId: "<digits>"` to replace; otherwise it says why and leaves the file alone.
 */
export async function writeGuildId(filepath: string, id: string): Promise<GuildIdWrite> {
	if (!/^\d{1,20}$/.test(id)) return { written: false, reason: `\`${id}\` is not a server id` };
	let text: string;
	try {
		text = await readFile(filepath, "utf8");
	} catch (err) {
		return {
			written: false,
			reason: `could not read ${filepath} (${err instanceof Error ? err.message : String(err)})`,
		};
	}
	const count = [...text.matchAll(GUILD_ID)].length;
	if (count !== 1) {
		return {
			written: false,
			reason:
				count === 0
					? 'the config has no `guildId: "..."` to replace'
					: "the config has more than one `guildId` to choose from",
		};
	}
	await writeFile(
		filepath,
		text.replace(GUILD_ID, (_m, key: string, quote: string) => `${key}${quote}${id}${quote}`),
		"utf8"
	);
	return { written: true };
}
