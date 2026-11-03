import { describe, expect, it } from "vitest";

import { idFromSource } from "./id-from-source.js";

describe("idFromSource", () => {
	it("makes a colon of the suite folder", () => {
		expect(idFromSource("ci/workflows/test/unit.yml")).toBe("test:unit");
		expect(idFromSource("ci/workflows/lint/code.yml")).toBe("lint:code");
	});

	it("keeps a leaf in no suite as its file name, hyphens included", () => {
		expect(idFromSource("ci/workflows/typecheck.yml")).toBe("typecheck");
		expect(idFromSource("ci/workflows/deploy-preview.yml")).toBe("deploy-preview");
	});

	it("reads the path the index globs, one level below the repo root", () => {
		expect(idFromSource("../workflows/scan/secrets.yml")).toBe("scan:secrets");
		expect(idFromSource("../workflows/ci.yml")).toBe("ci");
	});
});
