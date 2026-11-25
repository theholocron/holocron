import { describe, expect, it } from "vitest";

import { newestDestination } from "./newest-destination.js";

const d = (id: string, created_at?: string) => ({ id, name: "Cloudflare", url: "https://x/...", created_at });

describe("newestDestination", () => {
	it("returns nothing for an empty list", () => {
		expect(newestDestination([])).toBeUndefined();
	});

	it("prefers the latest created_at wherever it is in the list", () => {
		const list = [d("a", "2026-02-01T00:00:00Z"), d("b", "2026-03-01T00:00:00Z"), d("c", "2026-01-01T00:00:00Z")];
		expect(newestDestination(list)?.id).toBe("b");
	});

	it("takes the last in list order when none has a date", () => {
		expect(newestDestination([d("a"), d("b"), d("c")])?.id).toBe("c");
	});

	it("lets a dated destination beat an undated one", () => {
		expect(newestDestination([d("a", "2026-01-01T00:00:00Z"), d("b")])?.id).toBe("a");
		expect(newestDestination([d("a"), d("b", "2026-01-01T00:00:00Z")])?.id).toBe("b");
	});
});
