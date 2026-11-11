import { describe, expect, it } from "vitest";

import {
	compose,
	docsPreset,
	docsSitePreset,
	monorepoPreset,
	nextjsPreset,
	nodePreset,
	reactPreset,
	withCapabilities,
} from "./index.js";

const { withAudit, withDocs, withMonorepo, withNode, withTypecheck, withWiki } = withCapabilities;

describe("withNode() capability", () => {
	it("has id 'node'", () => {
		expect(withNode().id).toBe("node");
	});

	it("marks lint and test required (branch-protection checks are derived from these)", () => {
		const byName = new Map((withNode().tasks ?? []).map((t) => (typeof t === "string" ? [t, {}] : [t.name, t])));
		for (const id of [
			"lint:code",
			"lint:editorconfig",
			"lint:markdown",
			"format",
			"lint:data",
			"scan:secrets",
			"lint:commits",
			"test:unit",
		]) {
			expect(byName.get(id)).toMatchObject({ required: true });
		}
	});

	it("contributes the baseline workflow set without typecheck", () => {
		const names = (withNode().tasks ?? []).map((w) => (typeof w === "string" ? w : w.name));
		for (const expected of ["scan:code", "annotate", "mark-stale", "greet", "update-deps", "label"]) {
			expect(names).toContain(expected);
		}
		expect(names).not.toContain("typecheck");
	});

	it("speaks only flat ids: no dotted names, no suite names, no pre-flat workflow keys", () => {
		const names = (withNode().tasks ?? []).map((w) => (typeof w === "string" ? w : w.name));
		for (const old of ["lint", "test", "security", "review", "stale", "greetings", "dependencies", "bookkeeping"]) {
			expect(names).not.toContain(old);
		}
		expect(names.filter((n) => n.includes("."))).toEqual([]);
	});
});

describe("compose(withNode())", () => {
	it("produces a ComposedPreset with strict protection", () => {
		const { repo } = compose(withNode());
		expect(repo.protection).toBe("strict");
	});

	it("includes github source and ci providers", () => {
		const { providers } = compose(withNode());
		expect(providers.source).toBe("github");
		expect(providers.ci).toBe("github");
	});

	it("does not include typecheck (add withTypecheck() separately)", () => {
		const { tasks } = compose(withNode());
		const names = tasks.map((w) => (typeof w === "string" ? w : w.name));
		expect(names).not.toContain("typecheck");
	});

	it("includes typecheck when withTypecheck() is composed in", () => {
		const { tasks } = compose(withNode(), withTypecheck());
		const names = tasks.map((w) => (typeof w === "string" ? w : w.name));
		expect(names).toContain("typecheck");
	});

	it("includes deploy when withDocs() is composed in", () => {
		const { tasks } = compose(withNode(), withDocs());
		const deploy = tasks.find((w) => typeof w !== "string" && w.name === "deploy-docs");
		expect(deploy).toMatchObject({ name: "deploy-docs", with: { preview: true } });
	});
});

describe("docsPreset()", () => {
	describe("top-level fields", () => {
		it("sets org and domain", () => {
			const { org, domain } = docsPreset();
			expect(org).toBe("theholocron");
			expect(domain).toBe("theholocron.dev");
		});

		it("sets docs config", () => {
			const { docs: docsConfig } = docsPreset();
			expect(docsConfig).toEqual({ build: "workflow", https: true });
		});
	});

	describe("providers", () => {
		it("adds cloudflare deployment and dns, with no accountId (it comes from the credential chain)", () => {
			const { providers } = docsPreset();
			expect(providers.deployment).toBe("cloudflare");
			expect(providers.dns).toBe("cloudflare");
		});

		it("inherits github source and ci from withNode()", () => {
			const { providers } = docsPreset();
			expect(providers.source).toBe("github");
			expect(providers.ci).toBe("github");
		});
	});

	describe("required checks", () => {
		it("marks lint / test / typecheck required so their Conclusion checks are derived", () => {
			const byName = new Map(docsPreset().tasks.map((t) => (typeof t === "string" ? [t, {}] : [t.name, t])));
			expect(byName.get("lint:code")).toMatchObject({ required: true });
			expect(byName.get("test:unit")).toMatchObject({ required: true });
			expect(byName.get("typecheck")).toMatchObject({ required: true });
		});

		it("carries audit / Conclusion + the codecov gates as extraRequiredChecks", () => {
			const { extraRequiredChecks } = docsPreset();
			expect(extraRequiredChecks).toContain("audit / Conclusion");
			expect(extraRequiredChecks).toContain("codecov/patch");
			expect(extraRequiredChecks).toContain("codecov/project");
		});
	});

	describe("tasks", () => {
		it("includes all withNode() baseline tasks and typecheck", () => {
			const { tasks } = docsPreset();
			const names = tasks.map((w) => (typeof w === "string" ? w : w.name));
			expect(names).toContain("lint:code");
			expect(names).toContain("test:unit");
			expect(names).toContain("typecheck");
		});

		it("includes deploy-docs with preview", () => {
			const { tasks } = docsPreset();
			const deploy = tasks.find((w) => typeof w !== "string" && w.name === "deploy-docs");
			expect(deploy).toMatchObject({ name: "deploy-docs", with: { preview: true } });
		});

		it("does not include audit workflow (stays repo-specific)", () => {
			const { tasks } = docsPreset();
			const names = tasks.map((w) => (typeof w === "string" ? w : w.name));
			expect(names).not.toContain("audit");
		});

		it("does not include release (stays repo-specific)", () => {
			const { tasks } = docsPreset();
			const names = tasks.map((w) => (typeof w === "string" ? w : w.name));
			expect(names).not.toContain("release");
		});
	});
});

describe("nextjsPreset()", () => {
	describe("top-level fields", () => {
		it("sets org and domain", () => {
			const { org, domain } = nextjsPreset();
			expect(org).toBe("theholocron");
			expect(domain).toBe("theholocron.dev");
		});
	});

	describe("providers", () => {
		it("sets vercel deployment and github secrets", () => {
			const { providers } = nextjsPreset();
			expect(providers.deployment).toBe("vercel");
			expect(providers.secrets).toBe("github");
		});
	});

	describe("repo", () => {
		it("sets browser runtime environment", () => {
			const { repo } = nextjsPreset();
			expect(repo.properties?.runtime_environment).toBe("browser");
		});

		it("includes Storybook and lhci extraRequiredChecks", () => {
			const { extraRequiredChecks } = nextjsPreset();
			expect(extraRequiredChecks).toContain("Storybook Publish");
			expect(extraRequiredChecks).toContain("UI Review");
			expect(extraRequiredChecks).toContain("UI Tests");
			expect(extraRequiredChecks).toContain("lhci/url/");
		});
	});

	describe("tasks", () => {
		it("includes lint:unused (knip) and test:perf (lighthouse)", () => {
			const { tasks } = nextjsPreset();
			expect(tasks).toContain("lint:unused");
			const perf = tasks.find((w) => typeof w !== "string" && w.name === "test:perf");
			expect(perf).toMatchObject({ name: "test:perf", with: { "lighthouse-config": "lighthouse.config.cjs" } });
		});

		it("includes test with storybook, interaction, and user-flow", () => {
			const { tasks } = nextjsPreset();
			const test = tasks.find((w) => typeof w !== "string" && w.name === "test:unit");
			expect(test).toMatchObject({
				name: "test:unit",
				with: { "run-storybook": true, "run-interaction": true, "run-user-flow": true, "run-unit": false },
			});
		});

		it("merges test overrides into the single test entry", () => {
			const { tasks } = nextjsPreset({ test: { "wait-on-url": "http://localhost:3000", "run-chromatic": true } });
			const test = tasks.find((w) => typeof w !== "string" && w.name === "test:unit");
			expect(test).toMatchObject({
				name: "test:unit",
				with: {
					"run-unit": false,
					"run-storybook": true,
					"run-interaction": true,
					"run-user-flow": true,
					"wait-on-url": "http://localhost:3000",
					"run-chromatic": true,
				},
			});
			expect(tasks.filter((w) => typeof w !== "string" && w.name === "test:unit")).toHaveLength(1);
		});
	});
});

describe("reactPreset()", () => {
	describe("providers", () => {
		it("does not include vercel deployment", () => {
			const { providers } = reactPreset();
			expect(providers.deployment).toBeUndefined();
		});

		it("sets github secrets", () => {
			const { providers } = reactPreset();
			expect(providers.secrets).toBe("github");
		});
	});

	describe("tasks", () => {
		it("includes test without run-user-flow", () => {
			const { tasks } = reactPreset();
			const test = tasks.find((w) => typeof w !== "string" && w.name === "test:unit");
			expect(test).toMatchObject({ name: "test:unit", with: { "run-storybook": true, "run-interaction": true } });
			expect(test).not.toMatchObject({ with: { "run-user-flow": expect.anything() } });
		});
	});
});

describe("withAudit() capability", () => {
	it("contributes only a required measure-bundle task when no options given", () => {
		const cap = withAudit();
		expect(cap.tasks).toEqual([{ name: "measure:bundle", required: true }]);
	});

	it("adds a required lint:unused task when knip: true", () => {
		const cap = withAudit({ knip: true });
		expect(cap.tasks).toContainEqual({ name: "lint:unused", required: true });
		expect(cap.tasks).not.toContainEqual(expect.objectContaining({ name: "test:perf" }));
	});

	it("adds a required test:perf task when performance: true", () => {
		const cap = withAudit({ performance: true });
		expect(cap.tasks).toContainEqual({ name: "test:perf", required: true });
		expect(cap.tasks).not.toContainEqual(expect.objectContaining({ name: "lint:unused" }));
	});

	it("passes lighthouseConfig to test:perf", () => {
		const cap = withAudit({ knip: true, performance: true, lighthouseConfig: "lighthouse.config.cjs" });
		expect(cap.tasks).toContainEqual({
			name: "test:perf",
			required: true,
			with: { "lighthouse-config": "lighthouse.config.cjs" },
		});
	});

	it("ignores lighthouseConfig without performance", () => {
		const cap = withAudit({ lighthouseConfig: "lighthouse.config.cjs" });
		expect(cap.tasks).toEqual([{ name: "measure:bundle", required: true }]);
	});
});

describe("docsSitePreset()", () => {
	it("sets org and domain", () => {
		const { org, domain } = docsSitePreset();
		expect(org).toBe("theholocron");
		expect(domain).toBe("theholocron.dev");
	});

	it("does not include typecheck or audit tasks", () => {
		const { tasks } = docsSitePreset();
		const names = tasks.map((w) => (typeof w === "string" ? w : w.name));
		expect(names).not.toContain("typecheck");
		expect(names).not.toContain("audit");
	});

	it("includes deploy-docs with preview", () => {
		const { tasks } = docsSitePreset();
		const deploy = tasks.find((w) => typeof w !== "string" && w.name === "deploy-docs");
		expect(deploy).toMatchObject({ name: "deploy-docs", with: { preview: true } });
	});

	it("does not carry Typecheck or audit required checks", () => {
		const preset = docsSitePreset();
		const names = preset.tasks.map((t) => (typeof t === "string" ? t : t.name));
		expect(names).not.toContain("typecheck");
		expect(preset.extraRequiredChecks).not.toContain("audit / Conclusion");
	});
});

describe("withMonorepo()", () => {
	it("sets uses_external_packages to true when composed", () => {
		const { repo } = compose(withNode(), withMonorepo());
		expect(repo.properties?.uses_external_packages).toBe(true);
	});
});

describe("monorepoPreset()", () => {
	it("wraps nextjsPreset() and sets uses_external_packages to true", () => {
		const { repo } = monorepoPreset(nextjsPreset());
		expect(repo.properties?.uses_external_packages).toBe(true);
	});

	it("wraps reactPreset() and preserves browser runtime", () => {
		const { repo } = monorepoPreset(reactPreset());
		expect(repo.properties?.runtime_environment).toBe("browser");
		expect(repo.properties?.uses_external_packages).toBe(true);
	});

	it("wraps docsPreset() and preserves org and domain", () => {
		const result = monorepoPreset(docsPreset());
		expect(result.org).toBe("theholocron");
		expect(result.domain).toBe("theholocron.dev");
	});
});

describe("withWiki() capability", () => {
	it("has id 'wiki'", () => {
		expect(withWiki().id).toBe("wiki");
	});

	it("sets wiki provider to fern with theholocron domain", () => {
		const { providers } = withWiki();
		expect(providers?.wiki).toMatchObject(["fern", { domain: "wiki.theholocron.dev", fernOrg: "holocron" }]);
	});

	it("includes wiki workflow", () => {
		const tasks = (withWiki().tasks ?? []).map((w) => (typeof w === "string" ? w : w.name));
		expect(tasks).toContain("publish-wiki");
	});
});

describe("nodePreset()", () => {
	it("is the withNode() capability composed on its own", () => {
		expect(nodePreset()).toEqual(compose(withNode()));
	});
});
