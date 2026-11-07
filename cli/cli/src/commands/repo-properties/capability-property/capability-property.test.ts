import { describe, expect, it } from "vitest";

import { CARDINALITY } from "../../../plugin/index.js";
import { CAPABILITIES_PROPERTY, capabilityValues } from "./capability-property.js";

describe("capabilityValues", () => {
	it("is every capability the CLI defines, sorted, with projects and tunnels among them", () => {
		const values = capabilityValues();
		expect(values).toEqual(Object.keys(CARDINALITY).sort());
		expect(values).toEqual(expect.arrayContaining(["projects", "tunnels", "credentials"]));
		expect(CAPABILITIES_PROPERTY).toBe("holocron_capabilities");
	});
});
