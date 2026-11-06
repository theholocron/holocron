import { describe, expect, it } from "vitest";

import * as upgrade from "./index.js";

describe("@theholocron/astromech/upgrade", () => {
	it("exports the public surface", () => {
		expect(Object.keys(upgrade).sort()).toEqual([
			"detectNodeMajor",
			"fetchLatestFromNpm",
			"patchDockerfile",
			"patchPackageJson",
			"patchPinFile",
			"patchToolVersions",
			"patchYaml",
			"runUpgradeNode",
		]);
	});
});
