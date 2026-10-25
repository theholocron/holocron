import { readFile, writeFile } from "node:fs/promises";

import { errorMessage } from "@theholocron/misc-utils";

import type { GuildIdWrite } from "./notifications-create-server.type.js";

const GUILD_ID = /(["']?guildId["']?\s*:\s*)(["'])(\d{1,20})\2/g;
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*)/;

/** The file with its comment-only lines blanked (same length per line), so a commented-out `guildId` is not matched. */
const withoutComments = (text: string): string =>
	text
		.split("\n")
		.map((line) => (COMMENT_LINE.test(line) ? " ".repeat(line.length) : line))
		.join("\n");

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
			reason: `could not read ${filepath} (${errorMessage(err)})`,
		};
	}
	const active = withoutComments(text);
	const count = [...active.matchAll(GUILD_ID)].length;
	if (count !== 1) {
		return {
			written: false,
			reason:
				count === 0
					? 'the config has no `guildId: "..."` to replace'
					: "the config has more than one `guildId` to choose from",
		};
	}
	// The match position in the blanked copy is the position in the file, so replace there and nowhere else.
	const hit = [...active.matchAll(GUILD_ID)][0]!;
	const digits = hit[3]!;
	const at = hit.index! + hit[0].length - 1 - digits.length;
	try {
		await writeFile(filepath, `${text.slice(0, at)}${id}${text.slice(at + digits.length)}`, "utf8");
	} catch (err) {
		return {
			written: false,
			reason: `could not write ${filepath} (${errorMessage(err)})`,
		};
	}
	return { written: true };
}
