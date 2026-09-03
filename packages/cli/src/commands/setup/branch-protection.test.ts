import { describe, expect, it } from "vitest";

import { ProviderApiError } from "../../capabilities.js";
import { buildClassicProtectionPayload, buildRulesetPayload, upsertBranchProtection } from "./branch-protection.js";

describe("buildRulesetPayload", () => {
	it("includes deletion and non_fast_forward rules always", () => {
		const payload = buildRulesetPayload([]);
		const rules = payload.rules as Array<{ type: string }>;
		expect(rules.some((r) => r.type === "deletion")).toBe(true);
		expect(rules.some((r) => r.type === "non_fast_forward")).toBe(true);
	});

	it("adds required_status_checks rule when checks are provided", () => {
		const payload = buildRulesetPayload(["DCO", "Lint / Conclusion"]);
		const rules = payload.rules as Array<{ type: string }>;
		expect(rules.some((r) => r.type === "required_status_checks")).toBe(true);
	});

	it("omits required_status_checks rule when no checks are provided", () => {
		const payload = buildRulesetPayload([]);
		const rules = payload.rules as Array<{ type: string }>;
		expect(rules.some((r) => r.type === "required_status_checks")).toBe(false);
	});
});

describe("buildClassicProtectionPayload", () => {
	it("sets required_status_checks when checks are provided", () => {
		const payload = buildClassicProtectionPayload(["DCO"]);
		expect(payload.required_status_checks).not.toBeNull();
	});

	it("sets required_status_checks to null when no checks are provided", () => {
		const payload = buildClassicProtectionPayload([]);
		expect(payload.required_status_checks).toBeNull();
	});
});

describe("upsertBranchProtection", () => {
	const makeSource = (overrides: Record<string, unknown> = {}) => ({
		listRulesets: async () => [],
		createRuleset: async () => {},
		updateRuleset: async () => {},
		getRepo: async () => ({ defaultBranch: "main" }),
		protectBranch: async () => {},
		...overrides,
	});

	it("returns dry-run without calling source when dryRun is true (line 67)", async () => {
		let called = false;
		const source = makeSource({ listRulesets: async () => { called = true; return []; } });
		const result = await upsertBranchProtection(source as never, true, []);
		expect(called).toBe(false);
		expect(result.status).toBe("dry-run");
	});

	it("creates a new ruleset when none exists", async () => {
		const result = await upsertBranchProtection(makeSource() as never, false, []);
		expect(result.status).toBe("ok");
		expect(result.message).toBe("created");
	});

	it("updates an existing ruleset when found by name", async () => {
		const source = makeSource({
			listRulesets: async () => [{ id: 1, name: "holocron-default-branch" }],
		});
		const result = await upsertBranchProtection(source as never, false, []);
		expect(result.status).toBe("ok");
		expect(result.message).toBe("updated");
	});

	it("falls back to classic protection when rulesets return 403", async () => {
		const source = makeSource({
			listRulesets: async () => { throw new ProviderApiError("Forbidden", 403); },
		});
		const result = await upsertBranchProtection(source as never, false, []);
		expect(result.status).toBe("ok");
		expect(result.message).toContain("classic protection");
	});

	it("returns fail for non-403 ProviderApiError thrown by listRulesets", async () => {
		const source = makeSource({
			listRulesets: async () => { throw new ProviderApiError("Server error", 500); },
		});
		const result = await upsertBranchProtection(source as never, false, []);
		expect(result.status).toBe("fail");
		expect(result.message).toBe("Server error");
	});

	it("returns fail with String(err) when ruleset throws a non-Error value (line 85 false branch)", async () => {
		const source = makeSource({
			// eslint-disable-next-line @typescript-eslint/only-throw-error
			listRulesets: async () => { throw "raw string"; },
		});
		const result = await upsertBranchProtection(source as never, false, []);
		expect(result.status).toBe("fail");
		expect(result.message).toBe("raw string");
	});

	it("skips when classic protection returns 403 (plan restriction)", async () => {
		const source = makeSource({
			listRulesets: async () => { throw new ProviderApiError("Forbidden", 403); },
			protectBranch: async () => { throw new ProviderApiError("Upgrade required", 403); },
		});
		const result = await upsertBranchProtection(source as never, false, []);
		expect(result.status).toBe("skip");
	});

	it("returns fail for non-403 error thrown by classic protection fallback", async () => {
		const source = makeSource({
			listRulesets: async () => { throw new ProviderApiError("Forbidden", 403); },
			protectBranch: async () => { throw new ProviderApiError("Network error", 500); },
		});
		const result = await upsertBranchProtection(source as never, false, []);
		expect(result.status).toBe("fail");
		expect(result.message).toBe("Network error");
	});

	it("returns fail with String(err) when classic protection throws a non-Error value (line 108 false branch)", async () => {
		const source = makeSource({
			listRulesets: async () => { throw new ProviderApiError("Forbidden", 403); },
			// eslint-disable-next-line @typescript-eslint/only-throw-error
			protectBranch: async () => { throw "raw string"; },
		});
		const result = await upsertBranchProtection(source as never, false, []);
		expect(result.status).toBe("fail");
		expect(result.message).toBe("raw string");
	});
});
