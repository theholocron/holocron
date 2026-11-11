import { describe, expect, it } from "vitest";

import { parseExportArgs } from "./parse-export-args.js";

describe("parseExportArgs", () => {
	it("takes the Environment, repeated --only in both spellings, and --copy", () => {
		expect(parseExportArgs(["prod", "--only", "A", "--only=B", "--copy"])).toEqual({
			environment: "prod",
			only: ["A", "B"],
			copy: true,
		});
	});

	it("defaults to every variable and no clipboard", () => {
		expect(parseExportArgs(["Sentinel - dev"])).toEqual({ environment: "Sentinel - dev", only: [], copy: false });
	});

	it("refuses --only with no name, an unknown option, and anything but one Environment", () => {
		expect(() => parseExportArgs(["prod", "--only"])).toThrow(/--only needs a variable name/);
		expect(() => parseExportArgs(["prod", "--force"])).toThrow(/unknown option --force/);
		expect(() => parseExportArgs([])).toThrow(/name one Environment/);
		expect(() => parseExportArgs(["a", "b"])).toThrow(/name one Environment/);
	});
});
