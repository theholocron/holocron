import { describe, expect, it } from "vitest";

import { deployScript } from "./deploy-script.js";

const manifest = (json: unknown) => (path: string) => {
	expect(path).toBe("/repo/apps/sentinel/package.json");
	return json;
};

describe("deployScript", () => {
	it("uses deploy, the flat task id", () => {
		expect(deployScript(manifest({ scripts: { deploy: "x" } }), "/repo/apps/sentinel")).toBe("deploy");
	});

	it("uses the old delivery.deploy when that is the only one the package has", () => {
		expect(deployScript(manifest({ scripts: { "delivery.deploy": "x" } }), "/repo/apps/sentinel")).toBe(
			"delivery.deploy"
		);
	});

	it("prefers deploy when the package has both", () => {
		expect(
			deployScript(manifest({ scripts: { deploy: "x", "delivery.deploy": "y" } }), "/repo/apps/sentinel")
		).toBe("deploy");
	});

	it("falls back to deploy for a package with no scripts, no manifest or an unreadable one", () => {
		expect(deployScript(manifest({}), "/repo/apps/sentinel")).toBe("deploy");
		expect(deployScript(manifest(undefined), "/repo/apps/sentinel")).toBe("deploy");
		expect(
			deployScript(() => {
				throw new Error("ENOENT");
			}, "/repo/apps/sentinel")
		).toBe("deploy");
	});
});
