import { describe, expect, it } from "vitest";

import { resolveConfig } from "../../config/index.js";
import { requiredChecksFor } from "./required-checks-for.js";

const config = (raw: Record<string, unknown>) =>
	resolveConfig({ name: "demo", providers: {}, ...raw } as Parameters<typeof resolveConfig>[0]);

describe("requiredChecksFor", () => {
	it("requires the ci aggregate and DCO when a task is required, in a repo that does not host the reusables", () => {
		const checks = requiredChecksFor(config({ tasks: [{ name: "typecheck", required: true }] }), "/tmp/nowhere");
		expect(checks).toEqual(["ci / Required checks", "DCO"]);
	});

	it("waits on extraRequiredChecks through ci instead of listing them", () => {
		const checks = requiredChecksFor(
			config({
				tasks: [{ name: "typecheck", required: true }],
				extraRequiredChecks: ["codecov/patch", "Other / Check"],
			}),
			"/tmp/nowhere"
		);
		expect(checks).toEqual(["ci / Required checks", "DCO"]);
	});

	it("requires the ci aggregate when only extraRequiredChecks give it something to wait on", () => {
		const checks = requiredChecksFor(
			config({ tasks: ["typecheck"], extraRequiredChecks: ["Other / Check"] }),
			"/tmp"
		);
		expect(checks).toEqual(["ci / Required checks", "DCO"]);
	});

	it("keeps DCO alone when nothing is required, because no ci caller is written to post the aggregate", () => {
		expect(requiredChecksFor(config({ tasks: ["typecheck"] }), "/tmp/nowhere")).toEqual(["DCO"]);
		expect(requiredChecksFor(config({}), "/tmp/nowhere")).toEqual(["DCO"]);
	});
});
