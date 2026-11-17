import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseMockServer } from "@usebruno/filestore";
import { describe, expect, it } from "vitest";

/** This repository's committed `.bruno/mocks/`: the mock servers Bruno keeps beside the collections. */
const MOCKS = fileURLToPath(new URL("../../../.bruno/mocks/", import.meta.url));

describe("the committed .bruno/mocks/", () => {
	const mock = parseMockServer(readFileSync(`${MOCKS}comlink.yml`, "utf8"), { format: "yml" });

	it("has a Discord webhook stand-in that is standalone, so it names no path on anyone's machine", () => {
		expect(mock.name).toBe("Comlink Discord webhook");
		expect(mock.source).toBeNull();
	});

	it("answers 204 where Discord takes a post and 500 where it refuses, which Comlink turns into 204 and 502", () => {
		const routes = mock.routes.map((route) => [route.request.method, route.request.url, route.response.status]);
		expect(routes).toEqual([
			["POST", "/discord/accepts", 204],
			["POST", "/discord/refuses", 500],
		]);
	});

	it("serves on the port the Comlink docs name", () => {
		expect(mock.port).toBe(4000);
	});
});
