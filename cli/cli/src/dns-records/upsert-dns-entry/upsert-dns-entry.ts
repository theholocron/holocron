import type { DnsListEntry } from "../dns-records.type.js";

/** An entry's identity: its type and its name, without case or a final dot. */
export const entryKey = (e: Pick<DnsListEntry, "type" | "name">): string =>
	`${e.type} ${e.name.toLowerCase().replace(/\.$/, "")}`;

/**
 * The list with `entry` in it: a new entry goes last, one with the same type and name takes its place (order kept)
 * and is returned as `replaced`. The list given is not changed.
 */
export function upsertDnsEntry(
	list: readonly DnsListEntry[],
	entry: DnsListEntry
): { list: DnsListEntry[]; replaced: DnsListEntry | undefined } {
	const at = list.findIndex((e) => entryKey(e) === entryKey(entry));
	if (at === -1) return { list: [...list, entry], replaced: undefined };
	return { list: list.map((e, i) => (i === at ? entry : e)), replaced: list[at] };
}
