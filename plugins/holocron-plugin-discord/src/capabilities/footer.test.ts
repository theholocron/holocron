import { describe, expect, it } from "vitest";

import { findFooter, replaceFooter } from "./footer.js";

describe("findFooter", () => {
	it("reads the key and the state of the footer line, and where the line starts", () => {
		const content = "body\n\n-# sync: docs/a.spec.md | changes requested";
		expect(findFooter(content)).toEqual({
			index: 6,
			text: "-# sync: docs/a.spec.md | changes requested",
			key: "docs/a.spec.md",
			synced: "changes requested",
		});
	});

	it("has an empty state when the line ends after the separator", () => {
		expect(findFooter("-# sync: a.md | ")?.synced).toBe("");
	});

	it("splits at the last separator, because a key may hold one", () => {
		const footer = findFooter("-# sync: a | b.md | open");
		expect(footer).toMatchObject({ key: "a | b.md", synced: "open" });
	});

	it("stops a line at a carriage return, so the state does not carry it", () => {
		expect(findFooter("-# sync: a.md | open\r\nmore")).toMatchObject({
			text: "-# sync: a.md | open",
			synced: "open",
		});
	});

	it("is null with no footer: no marker, no separator, or no key before it", () => {
		expect(findFooter("")).toBeNull();
		expect(findFooter("just text")).toBeNull();
		expect(findFooter("-# sync: no separator here")).toBeNull();
		expect(findFooter("-# sync:  | open")).toBeNull();
		expect(findFooter("-# sync: | open")).toBeNull();
		expect(findFooter("x -# sync: a | b")).toBeNull();
	});

	it("takes the first footer line when more than one is there, and reads a long message in one pass", () => {
		expect(findFooter("-# sync: a | 1\n-# sync: b | 2")?.key).toBe("a");
		const started = Date.now();
		findFooter(`${"-# sync: ".repeat(20_000)}x`);
		findFooter("x".repeat(500_000));
		expect(Date.now() - started).toBeLessThan(1000);
	});
});

describe("replaceFooter", () => {
	it("swaps the footer line and keeps the text before and after it", () => {
		expect(replaceFooter("body\n\n-# sync: a.md | open\ntail", "-# sync: b.md | closed")).toBe(
			"body\n\n-# sync: b.md | closed\ntail"
		);
	});

	it("gives the message back as it was when it has no footer", () => {
		expect(replaceFooter("just a post", "-# sync: b.md | closed")).toBe("just a post");
	});
});
