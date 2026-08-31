import { describe, expect, it } from "vitest";

import type { Capability } from "../compose.js";
import { compose } from "../compose.js";
import { ConfigError } from "../config.js";

const node = (): Capability => ({
	id: "node",
	providers: { source: "github", ci: "github" },
	repo: { protection: "strict", properties: { lifecycle: "active" } },
	workflows: ["lint", "test", "codeql"],
	requiredChecks: ["Lint / Conclusion", "Test / Conclusion"],
});

const typecheck = (): Capability => ({
	id: "typecheck",
	requires: ["node"],
	workflows: ["typecheck"],
	requiredChecks: ["Typecheck / Conclusion"],
});

const docs = (): Capability => ({
	id: "docs",
	requires: ["node"],
	org: "theholocron",
	domain: "theholocron.dev",
	docs: { build: "workflow", https: true },
	providers: { deployment: "cloudflare" },
	workflows: [{ name: "deploy", with: { docs: true, preview: true } }],
	requiredChecks: ["codecov/patch", "codecov/project"],
});

const audit = (): Capability => ({
	id: "audit",
	requires: ["node"],
	workflows: ["audit"],
	requiredChecks: ["audit / Conclusion"],
});

describe("compose()", () => {
	it("merges workflows from multiple capabilities", () => {
		const preset = compose(node(), typecheck());
		expect(preset.workflows).toContainEqual("lint");
		expect(preset.workflows).toContainEqual("test");
		expect(preset.workflows).toContainEqual("typecheck");
	});

	it("deduplicates workflows by name — last writer wins", () => {
		const override: Capability = {
			id: "override",
			workflows: [{ name: "test", with: { "run-unit": false } }],
		};
		const preset = compose(node(), override);
		const testEntry = preset.workflows.find((w) => (typeof w === "string" ? w : w.name) === "test");
		expect(testEntry).toEqual({ name: "test", with: { "run-unit": false } });
		expect(preset.workflows.filter((w) => (typeof w === "string" ? w : w.name) === "test")).toHaveLength(1);
	});

	it("unions requiredChecks without duplicates", () => {
		const preset = compose(node(), typecheck(), docs(), audit());
		expect(preset.repo.requiredChecks).toEqual([
			"Lint / Conclusion",
			"Test / Conclusion",
			"Typecheck / Conclusion",
			"codecov/patch",
			"codecov/project",
			"audit / Conclusion",
		]);
	});

	it("always returns requiredChecks even when no capability sets them", () => {
		const cap: Capability = { id: "bare" };
		const preset = compose(cap);
		expect(preset.repo.requiredChecks).toEqual([]);
	});

	it("shallow-merges providers — later capability overrides per-key", () => {
		const preset = compose(node(), docs());
		expect(preset.providers).toMatchObject({ source: "github", deployment: "cloudflare" });
	});

	it("sets org, domain, docs from contributing capabilities", () => {
		const preset = compose(node(), docs());
		expect(preset.org).toBe("theholocron");
		expect(preset.domain).toBe("theholocron.dev");
		expect(preset.docs).toEqual({ build: "workflow", https: true });
	});

	it("last writer wins for org and domain", () => {
		const override: Capability = { id: "override", org: "other-org", domain: "other.dev" };
		const preset = compose(node(), docs(), override);
		expect(preset.org).toBe("other-org");
		expect(preset.domain).toBe("other.dev");
	});

	it("merges repo scalar fields — last writer wins", () => {
		const strict: Capability = { id: "a", repo: { protection: "strict" } };
		const balanced: Capability = { id: "b", repo: { protection: "balanced" } };
		expect(compose(strict, balanced).repo.protection).toBe("balanced");
	});

	it("merges repo.properties with Object.assign semantics", () => {
		const a: Capability = { id: "a", repo: { properties: { lifecycle: "active", open_source: true } } };
		const b: Capability = { id: "b", repo: { properties: { lifecycle: "deprecated" } } };
		expect(compose(a, b).repo.properties).toMatchObject({ lifecycle: "deprecated", open_source: true });
	});

	it("unions repo.topics without duplicates", () => {
		const a: Capability = { id: "a", repo: { topics: ["typescript", "cli"] } };
		const b: Capability = { id: "b", repo: { topics: ["cli", "node"] } };
		expect(compose(a, b).repo.topics).toEqual(["typescript", "cli", "node"]);
	});

	it("deduplicates capabilities by id — last wins", () => {
		const first: Capability = { id: "x", workflows: ["lint"], requiredChecks: ["Lint / Conclusion"] };
		const second: Capability = { id: "x", workflows: ["test"], requiredChecks: ["Test / Conclusion"] };
		const preset = compose(first, second);
		expect(preset.workflows).toContainEqual("test");
		expect(preset.workflows).not.toContainEqual("lint");
		expect(preset.repo.requiredChecks).toContain("Test / Conclusion");
		expect(preset.repo.requiredChecks).not.toContain("Lint / Conclusion");
	});

	it("flattens nested Capability[] from bundle presets", () => {
		const bundle = (): Capability[] => [typecheck(), audit()];
		const preset = compose(node(), bundle());
		expect(preset.workflows).toContainEqual("typecheck");
		expect(preset.workflows).toContainEqual("audit");
	});

	it("throws ConfigError listing all unmet dependencies at once", () => {
		expect(() => compose(typecheck())).toThrow(ConfigError);
		expect(() => compose(typecheck())).toThrow('"typecheck" requires "node"');
	});

	it("throws for multiple missing deps in one message", () => {
		const cap: Capability = { id: "big", requires: ["node", "typecheck"] };
		expect(() => compose(cap)).toThrow(ConfigError);
		const err = (() => {
			try {
				compose(cap);
			} catch (e) {
				return e as ConfigError;
			}
		})();
		expect(err?.message).toContain('"big" requires "node"');
		expect(err?.message).toContain('"big" requires "typecheck"');
	});

	it("does not throw when all requirements are satisfied", () => {
		expect(() => compose(node(), typecheck(), docs())).not.toThrow();
	});

	it("allows redundant explicit capability alongside bundle that includes it", () => {
		const bundle = (): Capability[] => [typecheck()];
		expect(() => compose(node(), typecheck(), bundle())).not.toThrow();
	});

	it("unions repo.teams by slug — later entry overrides permission", () => {
		const a: Capability = {
			id: "a",
			repo: { teams: [{ slug: "gatekeepers", permission: "push" }] },
		};
		const b: Capability = {
			id: "b",
			repo: {
				teams: [
					{ slug: "gatekeepers", permission: "maintain" },
					{ slug: "admins", permission: "admin" },
				],
			},
		};
		const preset = compose(a, b);
		expect(preset.repo.teams).toHaveLength(2);
		const gatekeepers = (preset.repo.teams ?? []).find(
			(t) => (typeof t === "string" ? t : t.slug) === "gatekeepers"
		);
		expect(gatekeepers).toEqual({ slug: "gatekeepers", permission: "maintain" });
	});

	it("handles string-shorthand team entries", () => {
		const a: Capability = { id: "a", repo: { teams: ["gatekeepers"] } };
		const b: Capability = { id: "b", repo: { teams: ["gatekeepers", "admins"] } };
		const preset = compose(a, b);
		expect(preset.repo.teams).toHaveLength(2);
		expect(preset.repo.teams).toContain("gatekeepers");
		expect(preset.repo.teams).toContain("admins");
	});

	it("deduplicates requiredChecks appearing in multiple capabilities", () => {
		const a: Capability = { id: "a", requiredChecks: ["Lint / Conclusion", "Test / Conclusion"] };
		const b: Capability = { id: "b", requiredChecks: ["Lint / Conclusion", "codecov/patch"] };
		const preset = compose(a, b);
		expect(preset.repo.requiredChecks).toEqual(["Lint / Conclusion", "Test / Conclusion", "codecov/patch"]);
	});
});
