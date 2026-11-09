import { parseFrontmatter } from "@theholocron/astromech/repo-validation";

import type { ParsedNote } from "../ideas-sync.type.js";

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;
const FENCE = /^(```|~~~)[\s\S]*?^\1/gm;
const WEB_ADDRESS = /^[a-z][a-z0-9+.-]*:/i;

const unquote = (value: string): string => value.replace(/^(["'])(.*)\1$/, "$2").trim();

/**
 * Reads one note: its `status:` and `issue:` properties, its title, its text without the frontmatter and the files it
 * embeds. The title is the first `#` heading, else `fileName` without `.md`. An embed is `![[x]]` (any) or `![](x)`
 * where `x` is not an address with a scheme; embeds inside a code fence are text and do not count.
 */
export function parseNote(text: string, fileName: string): ParsedNote {
	const fields = parseFrontmatter(text.replace(/\r\n/g, "\n"));
	const body = text.replace(FRONTMATTER, "");
	const prose = body.replace(/\r/g, "").replace(FENCE, "");
	const heading = /^#[ \t]+(.+?)[ \t]*$/m.exec(prose);
	const wiki = [...prose.matchAll(/!\[\[[^\]]+\]\]/g)].map((m) => m[0]);
	const links = [...prose.matchAll(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)]
		.filter((m) => !WEB_ADDRESS.test(m[1]!))
		.map((m) => m[0]);
	return {
		status: unquote(fields?.get("status")?.value ?? ""),
		issue: unquote(fields?.get("issue")?.value ?? ""),
		title: heading?.[1] ?? fileName.replace(/\.md$/i, ""),
		body,
		attachments: [...wiki, ...links],
	};
}
