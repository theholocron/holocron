import { describe, expect, it } from "vitest";

import { pictureSources } from "./picture-sources.js";

describe("pictureSources", () => {
	it("names none for an absent picture, including a null a config wrote", () => {
		expect(pictureSources(undefined)).toEqual([]);
		expect(pictureSources(null)).toEqual([]);
	});

	it("names a single path or URL as it is", () => {
		expect(pictureSources("media/a.png")).toEqual(["media/a.png"]);
	});

	it("names the url and then the image, leaving out one that is missing", () => {
		expect(pictureSources({ url: "https://x/a.png", image: "a.png" })).toEqual(["https://x/a.png", "a.png"]);
		expect(pictureSources({ image: "a.png" })).toEqual(["a.png"]);
		expect(pictureSources({})).toEqual([]);
	});
});
