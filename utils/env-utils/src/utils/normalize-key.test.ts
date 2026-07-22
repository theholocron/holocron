import { describe, expect, it } from "vitest";
import { normalizeKey } from "./index.js";

describe("normalizeKey", () => {
	it("splits dot syntax into a traversal path", () => {
		expect(normalizeKey("service.db.url")).toEqual([
			"service",
			"db",
			"url",
		]);
	});

	it("splits double underscores into a traversal path", () => {
		expect(normalizeKey("service__db__url")).toEqual([
			"service",
			"db",
			"url",
		]);
	});

	it("uppercased double underscores normalize the same as lowercase", () => {
		expect(normalizeKey("SERVICE__DB__URL")).toEqual([
			"service",
			"db",
			"url",
		]);
	});

	it("single underscores produce a flat key — never a traversal path", () => {
		expect(normalizeKey("service_db_url")).toEqual(["service_db_url"]);
	});

	it("uppercased flat key lowercases correctly", () => {
		expect(normalizeKey("SERVICE_DB_URL")).toEqual(["service_db_url"]);
	});

	it("dot syntax and double underscores produce the same path", () => {
		expect(normalizeKey("service.db.url")).toEqual(
			normalizeKey("SERVICE__DB__URL"),
		);
	});
});
