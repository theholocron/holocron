import { AGGREGATE_CHECK, DCO_CHECK } from "@theholocron/astromech";
import { describe, expect, it } from "vitest";

import { aggregatePin } from "./aggregate-pin.js";

describe("aggregatePin", () => {
	it("pins nothing when the option is off", () => {
		expect(aggregatePin(undefined, [AGGREGATE_CHECK, DCO_CHECK])).toEqual({ pins: {} });
		expect(aggregatePin({ aggregate: "sentinel" }, [AGGREGATE_CHECK])).toEqual({ pins: {} });
	});

	it("pins only the aggregate context", () => {
		expect(aggregatePin({ pin: { integrationId: 42 } }, [AGGREGATE_CHECK, DCO_CHECK])).toEqual({
			pins: { [AGGREGATE_CHECK]: 42 },
		});
	});

	it("says why nothing is pinned when the aggregate is not required", () => {
		const plan = aggregatePin({ pin: { integrationId: 42 } }, [DCO_CHECK]);
		expect(plan.pins).toEqual({});
		expect(plan.problem).toContain("not a required check");
	});
});
