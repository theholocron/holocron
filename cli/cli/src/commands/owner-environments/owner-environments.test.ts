import { describe, expect, it } from "vitest";

import { resolveConfig } from "../../config/index.js";
import { ownerEnvironments } from "./owner-environments.js";

type Raw = Parameters<typeof resolveConfig>[0];

const configWith = (credentials: unknown, extra: Record<string, unknown> = {}) =>
	resolveConfig({ name: "demo", providers: { credentials, source: "github" }, ...extra } as Raw);

describe("ownerEnvironments", () => {
	it("lists the literal Environment a credentials provider names", () => {
		const config = configWith([["1password", { environment: "Own" }]]);
		expect(ownerEnvironments(config).names).toEqual(["Own"]);
	});

	it("has no name for a provider that derives its names", () => {
		const config = configWith(["1password"]);
		expect(ownerEnvironments(config).names).toEqual([]);
	});
});
