import { describe, expect, it } from "vitest";

import { patchPackageJson } from "./patch-package-json.js";

const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";

describe("patchPackageJson", () => {
	it("rewrites engines.node and an exact @types/node in either dependency field", () => {
		const out = patchPackageJson(
			json({
				engines: { node: ">=20" },
				devDependencies: { "@types/node": "^20.0.0" },
				dependencies: { "@types/node": "^20.0.0" },
			}),
			20,
			22
		);
		const pkg = JSON.parse(out!);
		expect(pkg.engines.node).toBe(">=22.0.0");
		expect(pkg.devDependencies["@types/node"]).toBe("^22.0.0");
		expect(pkg.dependencies["@types/node"]).toBe("^22.0.0");
	});

	it("leaves catalog pins, other majors and complex ranges alone", () => {
		expect(patchPackageJson(json({ devDependencies: { "@types/node": "catalog:" } }), 20, 22)).toBeNull();
		expect(patchPackageJson(json({ engines: { node: ">=18" } }), 20, 22)).toBeNull();
		expect(patchPackageJson(json({ engines: { node: "^20 || ^22" } }), 20, 22)).toBeNull();
	});

	it("returns null for unparseable JSON", () => {
		expect(patchPackageJson("{ nope", 20, 22)).toBeNull();
	});
});
