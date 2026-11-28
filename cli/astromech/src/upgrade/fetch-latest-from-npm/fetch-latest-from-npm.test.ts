import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchLatestFromNpm } from "./fetch-latest-from-npm.js";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("fetchLatestFromNpm", () => {
	it("returns the latest dist-tag and encodes the package name", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ "dist-tags": { latest: "1.2.3" } }),
		});
		vi.stubGlobal("fetch", fetchMock);
		expect(await fetchLatestFromNpm("@scope/pkg")).toBe("1.2.3");
		expect(fetchMock.mock.calls[0]![0]).toBe("https://registry.npmjs.org/%40scope%2Fpkg");
	});

	it("returns null on a non-2xx response", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
		expect(await fetchLatestFromNpm("x")).toBeNull();
	});

	it("returns null when there is no latest tag", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
		expect(await fetchLatestFromNpm("x")).toBeNull();
	});

	it("returns null when the request throws", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
		expect(await fetchLatestFromNpm("x")).toBeNull();
	});
});
