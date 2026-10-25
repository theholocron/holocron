import { describe, expect, it } from "vitest";

import { findGuildId } from "./find-guild-id.js";

const digits = (src: string) => findGuildId(src).map((s) => src.slice(s.start, s.end));

describe("findGuildId", () => {
	it("finds bare, quoted and single-quoted keys", () => {
		expect(digits('{ guildId: "1", "guildId": \'2\' }')).toEqual(["1", "2"]);
	});

	it("skips comments and strings, and values that are not digits", () => {
		expect(digits('// guildId: "1"\n/* guildId: "2" */\nconst s = "guildId: \\"3\\"";')).toEqual([]);
		expect(digits('{ guildId: "abc" }')).toEqual([]);
		expect(digits("{ guildId: 12 }")).toEqual([]);
		expect(digits('"guildId"')).toEqual([]);
		expect(digits("/* never closed")).toEqual([]);
		expect(digits("// no newline")).toEqual([]);
	});
});
