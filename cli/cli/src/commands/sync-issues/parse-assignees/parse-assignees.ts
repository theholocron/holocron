import type { AssigneeLink, AssigneesFile } from "./parse-assignees.type.js";

/**
 * Reads the assignees file's text. Throws with a plain reason on anything that is not that file, so a damaged one is
 * never treated as empty. A login or an email may appear once (compared without regard to case), because a repeat
 * would make the sync pick one of two people at random.
 */
export function parseAssignees(text: string): AssigneesFile {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new Error("the assignees file is not valid JSON");
	}
	const file = raw as { version?: unknown; links?: unknown };
	if (file.version !== 1)
		throw new Error(`the assignees file has version ${JSON.stringify(file.version)}; expected 1`);
	if (!Array.isArray(file.links)) throw new Error("the assignees file has no `links` list");
	const links: AssigneeLink[] = file.links.map((entry: unknown, i: number) => {
		const e = entry as Partial<Record<keyof AssigneeLink, unknown>>;
		if (typeof e.login !== "string" || e.login.trim() === "")
			throw new Error(`links[${i}]: \`login\` must be a string`);
		if (typeof e.email !== "string" || !e.email.includes("@")) {
			throw new Error(`links[${i}]: \`email\` must be an email address`);
		}
		return { login: e.login.trim(), email: e.email.trim() };
	});
	for (const key of ["login", "email"] as const) {
		const seen = new Set<string>();
		for (const [i, link] of links.entries()) {
			const value = link[key].toLowerCase();
			if (seen.has(value)) throw new Error(`links[${i}]: \`${key}\` ${link[key]} appears more than once`);
			seen.add(value);
		}
	}
	return { version: 1, links };
}
