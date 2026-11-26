import { describe, expect, it } from "vitest";

import { destinationMatches } from "./destination-matches.js";

const wanted = { name: "Cloudflare", url: "https://comlink.example.dev/cloudflare" };

describe("destinationMatches", () => {
	it("matches the exact URL", () => {
		expect(destinationMatches({ name: "Cloudflare", url: wanted.url }, wanted)).toBe(true);
	});

	it("matches a masked URL with the same origin, and a name in another case", () => {
		expect(destinationMatches({ name: "cloudflare", url: "https://comlink.example.dev/..." }, wanted)).toBe(true);
	});

	it("does not match another host or port", () => {
		expect(destinationMatches({ name: "Cloudflare", url: "https://other.example.dev/..." }, wanted)).toBe(false);
		expect(destinationMatches({ name: "Cloudflare", url: "https://comlink.example.dev:8443/..." }, wanted)).toBe(
			false
		);
	});

	it("does not match another name", () => {
		expect(destinationMatches({ name: "Vercel", url: "https://comlink.example.dev/..." }, wanted)).toBe(false);
	});

	it("does not match an unmasked URL that differs, or a masked one that is not a URL", () => {
		expect(destinationMatches({ name: "Cloudflare", url: "https://comlink.example.dev/other" }, wanted)).toBe(
			false
		);
		expect(destinationMatches({ name: "Cloudflare", url: "not a url..." }, wanted)).toBe(false);
	});

	it("does not take a real URL that ends in dots for a masked one", () => {
		expect(destinationMatches({ name: "Cloudflare", url: "https://comlink.example.dev/other..." }, wanted)).toBe(
			false
		);
		expect(destinationMatches({ name: "Cloudflare", url: "https://comlink.example.dev/a/..." }, wanted)).toBe(
			false
		);
	});

	it("matches no masked URL when the wanted URL is not a URL", () => {
		expect(
			destinationMatches({ name: "Cloudflare", url: "https://comlink.example.dev/..." }, { ...wanted, url: "x" })
		).toBe(false);
	});

	it("matches the exact URL whatever the name", () => {
		expect(destinationMatches({ name: "Renamed", url: wanted.url }, wanted)).toBe(true);
	});
});
