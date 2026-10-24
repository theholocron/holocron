import { describe, expect, it } from "vitest";

import { EMPTY_LINKS, linksLocation, parseLinks, serializeLinks, upsertLink } from "./links.js";

const LUKE = { github: "1", login: "luke", member: "333" };
const LEIA = { github: "2", login: "leia", member: "444" };

describe("parseLinks", () => {
	it("reads what serializeLinks wrote", () => {
		const file = { version: 1 as const, links: [LUKE, LEIA] };
		expect(parseLinks(serializeLinks(file))).toEqual(file);
	});

	it("refuses text that is not JSON, the wrong version, or no list", () => {
		expect(() => parseLinks("{nope")).toThrow(/not valid JSON/);
		expect(() => parseLinks('{"version":2,"links":[]}')).toThrow(/version 2/);
		expect(() => parseLinks('{"version":1}')).toThrow(/no `links` list/);
	});

	it("refuses an entry whose ids are not numeric strings or whose login is missing", () => {
		const bad = (entry: unknown) => parseLinks(JSON.stringify({ version: 1, links: [entry] }));
		expect(() => bad({ github: 1, login: "a", member: "3" })).toThrow(/links\[0\]: `github`/);
		expect(() => bad({ github: "1", login: "a", member: "x" })).toThrow(/links\[0\]: `member`/);
		expect(() => bad({ github: "1", login: 5, member: "3" })).toThrow(/links\[0\]: `login`/);
	});
});

describe("serializeLinks", () => {
	it("sorts by GitHub id numerically, indents two spaces and ends with a newline", () => {
		const out = serializeLinks({
			version: 1,
			links: [
				{ ...LEIA, github: "10" },
				{ ...LUKE, github: "9" },
			],
		});
		expect(out.endsWith("\n")).toBe(true);
		expect(out.indexOf('"9"')).toBeLessThan(out.indexOf('"10"'));
		expect(out).toContain('\n  "version": 1');
	});
});

describe("upsertLink", () => {
	it("adds a new link", () => {
		const out = upsertLink(EMPTY_LINKS, LUKE);
		expect(out.changed).toBe(true);
		expect(out.file.links).toEqual([LUKE]);
	});

	it("reports no change for one the file already says", () => {
		const file = { version: 1 as const, links: [LUKE, LEIA] };
		expect(upsertLink(file, { ...LUKE }).changed).toBe(false);
	});

	it("replaces an earlier link for the same GitHub account or the same member", () => {
		const file = { version: 1 as const, links: [LUKE, LEIA] };
		const relinked = upsertLink(file, { github: "1", login: "luke", member: "555" });
		expect(relinked.file.links.map((l) => l.member).sort()).toEqual(["444", "555"]);
		const taken = upsertLink(file, { github: "3", login: "han", member: "333" });
		expect(taken.file.links.map((l) => l.github).sort()).toEqual(["2", "3"]);
	});

	it("notices a renamed login", () => {
		expect(upsertLink({ version: 1, links: [LUKE] }, { ...LUKE, login: "skywalker" }).changed).toBe(true);
	});
});

describe("linksLocation", () => {
	it("defaults to the org's .github-private and a file named for the provider", () => {
		expect(linksLocation({}, "theholocron", "Discord")).toEqual({
			repo: "theholocron/.github-private",
			path: "notifications/discord-links.json",
		});
	});

	it("takes what the layout states", () => {
		expect(linksLocation({ links: { repo: "a/b", path: "x.json" } }, undefined, "discord")).toEqual({
			repo: "a/b",
			path: "x.json",
		});
	});

	it("needs an org or a repo", () => {
		expect(() => linksLocation({}, undefined, "discord")).toThrow(/no org/);
	});
});
