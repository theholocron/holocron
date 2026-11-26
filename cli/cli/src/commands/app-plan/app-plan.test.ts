import { describe, expect, it } from "vitest";

import type { ResolvedHolocronConfig, ResolvedTuple } from "../../config/index.js";
import { appPlan } from "./app-plan.js";

const tuple = (provider: string): ResolvedTuple => ({ provider, packageName: `p-${provider}`, options: {} });
const config = (parts: object) => ({ providers: {}, ...parts }) as unknown as ResolvedHolocronConfig;

describe("appPlan", () => {
	it("declares nothing for an app with no config", () => {
		expect(appPlan(undefined)).toEqual({ deployKeys: false });
	});

	it("reads the deployment provider and the deploy keys", () => {
		const plan = appPlan(
			config({
				providers: { deployment: { cardinality: "single", tuple: tuple("vercel") } },
				repo: { secrets: { deploy: [{ layer: "prod", prefix: "SENTINEL_" }] } },
			})
		);
		expect(plan.deployment?.provider).toBe("vercel");
		expect(plan.workers).toBeUndefined();
		expect(plan.deployKeys).toBe(true);
	});

	it("reads the workers provider", () => {
		const plan = appPlan(config({ providers: { workers: { cardinality: "single", tuple: tuple("cloudflare") } } }));
		expect(plan.workers?.provider).toBe("cloudflare");
		expect(plan.deployment).toBeUndefined();
	});

	it("counts an empty deploy list as no keys", () => {
		expect(appPlan(config({ repo: { secrets: { deploy: [] } } })).deployKeys).toBe(false);
	});

	it("ignores a many-valued entry", () => {
		const plan = appPlan(config({ providers: { deployment: { cardinality: "many", tuples: [tuple("vercel")] } } }));
		expect(plan.deployment).toBeUndefined();
	});
});
