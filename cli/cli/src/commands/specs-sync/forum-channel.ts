import type { NotificationsLayout } from "../../plugin/index.js";

/**
 * The forum channel the discussion posts live in: the one named, or the only forum the layout declares that is not the
 * pull request feed's (`feeds.prs`, whose posts Sentinel makes, one for each pull request). Returns the name, or the
 * reason there is none, so the run can refuse before it reads a document.
 */
export function forumChannel(layout: NotificationsLayout, wanted?: string): { channel: string } | { problem: string } {
	const forums = (layout.categories ?? []).flatMap((c) => c.channels ?? []).filter((c) => c.kind === "forum");
	if (wanted !== undefined) {
		const found = forums.find((c) => c.name.toLowerCase() === wanted.toLowerCase());
		return found
			? { channel: found.name }
			: { problem: `the layout declares no forum named \`${wanted}\` -- add it with \`kind: "forum"\`` };
	}
	const documents = forums.filter((c) => !c.feeds?.prs);
	if (documents.length === 1) return { channel: documents[0]!.name };
	return {
		problem:
			documents.length === 0
				? 'the layout declares no forum channel -- add one with `kind: "forum"`'
				: `the layout declares several forums (${documents.map((c) => `\`${c.name}\``).join(", ")}) -- pass --channel`,
	};
}
