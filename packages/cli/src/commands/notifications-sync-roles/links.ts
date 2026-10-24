/**
 * The file that says which server member is which GitHub account. Written by the sign-in flow (a member
 * proves both identities) and read by `notifications sync-roles` and the doctor. It holds two public ids
 * per person and nothing secret, but the pairing itself is something a member did not necessarily want
 * published, so it lives in a private repo.
 */

import type { NotificationsLayout } from "../../plugin/index.js";

export interface MemberLink {
	/** The GitHub user id, as a string. It survives a rename; the login does not. */
	github: string;
	/** The GitHub login when the link was made; for reports only. */
	login: string;
	/** The member's id on the notifications provider (for Discord, the user id). */
	member: string;
}

export interface LinksFile {
	version: 1;
	links: MemberLink[];
}

export const EMPTY_LINKS: LinksFile = { version: 1, links: [] };

const DIGITS = /^\d{1,20}$/;

/** Reads the file's text. Throws with a plain reason on anything that is not a links file, so a damaged one is never treated as empty. */
export function parseLinks(text: string): LinksFile {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new Error("the links file is not valid JSON");
	}
	const file = raw as { version?: unknown; links?: unknown };
	if (file.version !== 1) throw new Error(`the links file has version ${JSON.stringify(file.version)}; expected 1`);
	if (!Array.isArray(file.links)) throw new Error("the links file has no `links` list");
	const links: MemberLink[] = file.links.map((entry: unknown, i: number) => {
		const e = entry as Partial<Record<keyof MemberLink, unknown>>;
		if (typeof e.github !== "string" || !DIGITS.test(e.github)) {
			throw new Error(`links[${i}]: \`github\` must be a numeric user id string`);
		}
		if (typeof e.member !== "string" || !DIGITS.test(e.member)) {
			throw new Error(`links[${i}]: \`member\` must be a numeric id string`);
		}
		if (typeof e.login !== "string") throw new Error(`links[${i}]: \`login\` must be a string`);
		return { github: e.github, login: e.login, member: e.member };
	});
	return { version: 1, links };
}

/** Stable text: sorted by GitHub id, two-space JSON, one trailing newline, so a change is a clean diff. */
export function serializeLinks(file: LinksFile): string {
	const links = [...file.links].sort((a, b) => (BigInt(a.github) < BigInt(b.github) ? -1 : 1));
	return `${JSON.stringify({ version: 1, links }, null, 2)}\n`;
}

/**
 * Records that `link.github` and `link.member` are the same person. A GitHub account has one member and a
 * member one GitHub account, so any earlier entry for either is replaced. `changed` is false when the file
 * already said exactly this.
 */
export function upsertLink(file: LinksFile, link: MemberLink): { file: LinksFile; changed: boolean } {
	const kept = file.links.filter((l) => l.github !== link.github && l.member !== link.member);
	const next: LinksFile = { version: 1, links: [...kept, link] };
	return { file: next, changed: serializeLinks(next) !== serializeLinks(file) };
}

/** Where the links file is: the layout's `links`, else `<org>/.github-private` and `notifications/<provider>-links.json`. */
export function linksLocation(
	layout: NotificationsLayout,
	org: string | undefined,
	provider: string
): { repo: string; path: string } {
	const repo = layout.links?.repo ?? (org ? `${org}/.github-private` : undefined);
	if (!repo)
		throw new Error("no org to find the links file under — set `layout.links.repo` or `org` in holocron.config.ts");
	return { repo, path: layout.links?.path ?? `notifications/${provider.toLowerCase()}-links.json` };
}
