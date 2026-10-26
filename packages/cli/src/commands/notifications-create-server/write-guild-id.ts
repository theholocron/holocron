import { readFile, writeFile } from "node:fs/promises";

import { errorMessage } from "@theholocron/misc-utils";

import { findGuildId } from "./find-guild-id.js";
import type { GuildIdWrite } from "./notifications-create-server.type.js";

/**
 * Puts a new server id where the config names the old one. It changes a file the person wrote, so it only does
 * so when there is exactly one `guildId: "<digits>"` property to replace (a comment or string that mentions one is not); otherwise it says why and leaves the file alone.
 */
export async function writeGuildId(filepath: string, id: string): Promise<GuildIdWrite> {
	if (!/^\d{1,20}$/.test(id)) return { written: false, reason: `\`${id}\` is not a server id` };
	let text: string;
	try {
		text = await readFile(filepath, "utf8");
	} catch (err) {
		return {
			written: false,
			reason: `could not read ${filepath} (${errorMessage(err)})`,
		};
	}
	const spans = findGuildId(text);
	const count = spans.length;
	if (count !== 1) {
		return {
			written: false,
			reason:
				count === 0
					? 'the config has no `guildId: "..."` to replace'
					: "the config has more than one `guildId` to choose from",
		};
	}
	const { start, end } = spans[0]!;
	try {
		await writeFile(filepath, `${text.slice(0, start)}${id}${text.slice(end)}`, "utf8");
	} catch (err) {
		return {
			written: false,
			reason: `could not write ${filepath} (${errorMessage(err)})`,
		};
	}
	return { written: true };
}
