import type { NotificationsLayout, NotificationsPinnedLayout } from "../../plugin/index.js";
import { readRepoText } from "../read-repo-text/index.js";
import type { ReadRepoText, ResolvedPinnedFiles } from "./resolve-pinned-files.type.js";

/** A file's text as a message: no byte-order mark, `\n` line ends, and no blank lines at the end that Discord would trim anyway. */
function asMessage(text: string): string {
	const withoutMark = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
	return withoutMark.replace(/\r\n?/g, "\n").trimEnd();
}

/** Why a read failed, in a line that names no path of the machine it ran on. */
function reasonOf(err: unknown, root: string): string {
	if ((err as NodeJS.ErrnoException).code === "ENOENT") return "it does not exist";
	const message = err instanceof Error ? err.message : String(err);
	return message.split(root).join(".");
}

/**
 * Fill in the text of every pinned message that names a `file`, so a provider only ever sees `content`. The file is
 * the source of truth: the layout the provider gets holds what the file says now, and a message edited by hand in
 * the server differs from it and is replaced. A message that gives `content` is left as it is.
 *
 * Returns the first problem instead of a layout when a message gives both `content` and `file`, or a file that
 * cannot be read from inside the repository, so a run stops before it changes anything.
 */
export async function resolvePinnedFiles(
	layout: NotificationsLayout,
	repoRoot: string,
	read: ReadRepoText = readRepoText
): Promise<ResolvedPinnedFiles> {
	const pinned = layout.pinned;
	if (!pinned?.some((pin) => pin.file !== undefined)) return { layout };

	const resolved: NotificationsPinnedLayout[] = [];
	for (const pin of pinned) {
		if (pin.file === undefined) {
			resolved.push(pin);
			continue;
		}
		if (pin.content !== undefined) {
			return {
				problem: `pinned: the message for \`${pin.channel}\` sets both \`content\` and \`file\`; use one`,
			};
		}
		try {
			resolved.push({ channel: pin.channel, file: pin.file, content: asMessage(await read(repoRoot, pin.file)) });
		} catch (err) {
			return {
				problem: `pinned: \`${pin.file}\` (for #${pin.channel}) could not be read: ${reasonOf(err, repoRoot)}`,
			};
		}
	}
	return { layout: { ...layout, pinned: resolved } };
}
