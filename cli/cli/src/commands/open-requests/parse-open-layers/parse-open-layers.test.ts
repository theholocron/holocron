import { describe, expect, it } from "vitest";

import { parseOpenLayers } from "./parse-open-layers.js";

describe("parseOpenLayers", () => {
	it("is dev alone when nothing is given, never prod", () => {
		expect(parseOpenLayers(undefined)).toEqual(["dev"]);
		expect(parseOpenLayers([])).toEqual(["dev"]);
	});

	it("takes repeated and comma-separated values alike, in canonical order, once each", () => {
		expect(parseOpenLayers(["prod", "dev"])).toEqual(["dev", "prod"]);
		expect(parseOpenLayers(["dev,local"])).toEqual(["local", "dev"]);
		expect(parseOpenLayers([" local , dev", "dev"])).toEqual(["local", "dev"]);
		expect(parseOpenLayers(["prod"])).toEqual(["prod"]);
	});

	it("refuses ci, test and anything else, naming the allowed layers", () => {
		const err = (() => {
			try {
				parseOpenLayers(["dev", "ci", "test", "x"]);
			} catch (e) {
				return e;
			}
		})();
		expect((err as Error).constructor.name).toBe("ConfigError");
		expect((err as Error).message).toBe(
			'--environment does not know "ci", "test", "x": use local, dev, prod, comma-separated or repeated'
		);
	});

	it("refuses an empty name", () => {
		expect(() => parseOpenLayers(["dev,"])).toThrow(/does not know \(empty\)/);
	});
});
