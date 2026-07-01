import { describe, expect, it } from "vitest";

import { parseRepo, RepoError } from "../repo.js";

describe("parseRepo", () => {
	it("parses a well-formed owner/name pair", () => {
		expect(parseRepo("theholocron/holocron")).toEqual({
			owner: "theholocron",
			name: "holocron",
		});
	});

	it("throws RepoError when the input is empty", () => {
		expect(() => parseRepo("")).toThrow(RepoError);
		expect(() => parseRepo("")).toThrow(/required/);
	});

	it("throws RepoError when the input has no slash", () => {
		expect(() => parseRepo("holocron")).toThrow(RepoError);
		expect(() => parseRepo("holocron")).toThrow(/owner\/name/);
	});

	it("throws RepoError when the owner half is empty", () => {
		expect(() => parseRepo("/holocron")).toThrow(RepoError);
	});

	it("throws RepoError when the name half is empty", () => {
		expect(() => parseRepo("theholocron/")).toThrow(RepoError);
	});
});
