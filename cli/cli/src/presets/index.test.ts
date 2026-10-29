import { describe, expect, it } from "vitest";

import { node as nodePreset } from "./configs/node.js";
import { CLOUDFLARE_ACCOUNT_ID } from "./constants.js";
import {
	audit,
	compose,
	docs,
	monorepo,
	monorepoCapability,
	nextjs,
	node,
	nodeDocs,
	nodeDocsSite,
	react,
	typecheck,
	wikiCapability as wiki,
} from "./index.js";

describe("node() capability", () => {
	it("has id 'node'", () => {
		expect(node().id).toBe("node");
	});

	it("marks lint and test required (branch-protection checks are derived from these)", () => {
		const byName = new Map((node().tasks ?? []).map((t) => (typeof t === "string" ? [t, {}] : [t.name, t])));
		expect(byName.get("lint")).toMatchObject({ required: true });
		expect(byName.get("test")).toMatchObject({ required: true });
	});

	it("contributes the baseline workflow set without typecheck", () => {
		const names = (node().tasks ?? []).map((w) => (typeof w === "string" ? w : w.name));
		for (const expected of [
			"lint",
			"test",
			"security",
			"review",
			"stale",
			"greetings",
			"dependencies",
			"bookkeeping",
		]) {
			expect(names).toContain(expected);
		}
		expect(names).not.toContain("typecheck");
	});

	it("carries the org linter list on the lint task", () => {
		const lint = (node().tasks ?? []).find((w) => typeof w !== "string" && w.name === "lint");
		expect(lint).toMatchObject({ name: "lint" });
		expect((lint as { linters: string[] }).linters).toEqual(
			expect.arrayContaining(["eslint", "prettier", "yamllint", "actionlint", "gitleaks"])
		);
	});
});

describe("compose(node())", () => {
	it("produces a ComposedPreset with strict protection", () => {
		const { repo } = compose(node());
		expect(repo.protection).toBe("strict");
	});

	it("includes github source and ci providers", () => {
		const { providers } = compose(node());
		expect(providers.source).toBe("github");
		expect(providers.ci).toBe("github");
	});

	it("does not include typecheck (add typecheck() separately)", () => {
		const { tasks } = compose(node());
		const names = tasks.map((w) => (typeof w === "string" ? w : w.name));
		expect(names).not.toContain("typecheck");
	});

	it("includes typecheck when typecheck() is composed in", () => {
		const { tasks } = compose(node(), typecheck());
		const names = tasks.map((w) => (typeof w === "string" ? w : w.name));
		expect(names).toContain("typecheck");
	});

	it("includes deploy when docs() is composed in", () => {
		const { tasks } = compose(node(), docs());
		const deploy = tasks.find((w) => typeof w !== "string" && w.name === "deploy");
		expect(deploy).toMatchObject({ name: "deploy", with: { docs: true, preview: true } });
	});
});

describe("nodeDocs()", () => {
	describe("top-level fields", () => {
		it("sets org and domain", () => {
			const { org, domain } = nodeDocs();
			expect(org).toBe("theholocron");
			expect(domain).toBe("theholocron.dev");
		});

		it("sets docs config", () => {
			const { docs: docsConfig } = nodeDocs();
			expect(docsConfig).toEqual({ build: "workflow", https: true });
		});
	});

	describe("providers", () => {
		it("adds cloudflare deployment with accountId and dns", () => {
			const { providers } = nodeDocs();
			expect(providers.deployment).toEqual(["cloudflare", { accountId: CLOUDFLARE_ACCOUNT_ID }]);
			expect(providers.dns).toBe("cloudflare");
		});

		it("inherits github source and ci from node()", () => {
			const { providers } = nodeDocs();
			expect(providers.source).toBe("github");
			expect(providers.ci).toBe("github");
		});
	});

	describe("required checks", () => {
		it("marks lint / test / typecheck required so their Conclusion checks are derived", () => {
			const byName = new Map(nodeDocs().tasks.map((t) => (typeof t === "string" ? [t, {}] : [t.name, t])));
			expect(byName.get("lint")).toMatchObject({ required: true });
			expect(byName.get("test")).toMatchObject({ required: true });
			expect(byName.get("typecheck")).toMatchObject({ required: true });
		});

		it("carries audit / Conclusion + the codecov gates as extraRequiredChecks", () => {
			const { extraRequiredChecks } = nodeDocs();
			expect(extraRequiredChecks).toContain("audit / Conclusion");
			expect(extraRequiredChecks).toContain("codecov/patch");
			expect(extraRequiredChecks).toContain("codecov/project");
		});
	});

	describe("tasks", () => {
		it("includes all node() baseline tasks and typecheck", () => {
			const { tasks } = nodeDocs();
			const names = tasks.map((w) => (typeof w === "string" ? w : w.name));
			expect(names).toContain("lint");
			expect(names).toContain("test");
			expect(names).toContain("typecheck");
		});

		it("includes deploy with docs and preview", () => {
			const { tasks } = nodeDocs();
			const deploy = tasks.find((w) => typeof w !== "string" && w.name === "deploy");
			expect(deploy).toMatchObject({ name: "deploy", with: { docs: true, preview: true } });
		});

		it("does not include audit workflow (stays repo-specific)", () => {
			const { tasks } = nodeDocs();
			const names = tasks.map((w) => (typeof w === "string" ? w : w.name));
			expect(names).not.toContain("audit");
		});

		it("does not include release (stays repo-specific)", () => {
			const { tasks } = nodeDocs();
			const names = tasks.map((w) => (typeof w === "string" ? w : w.name));
			expect(names).not.toContain("release");
		});
	});
});

describe("nextjs()", () => {
	describe("top-level fields", () => {
		it("sets org and domain", () => {
			const { org, domain } = nextjs();
			expect(org).toBe("theholocron");
			expect(domain).toBe("theholocron.dev");
		});
	});

	describe("providers", () => {
		it("sets vercel deployment and github secrets", () => {
			const { providers } = nextjs();
			expect(providers.deployment).toBe("vercel");
			expect(providers.secrets).toBe("github");
		});
	});

	describe("repo", () => {
		it("sets browser runtime environment", () => {
			const { repo } = nextjs();
			expect(repo.properties?.runtime_environment).toBe("browser");
		});

		it("includes Storybook and lhci extraRequiredChecks", () => {
			const { extraRequiredChecks } = nextjs();
			expect(extraRequiredChecks).toContain("Storybook Publish");
			expect(extraRequiredChecks).toContain("UI Review");
			expect(extraRequiredChecks).toContain("UI Tests");
			expect(extraRequiredChecks).toContain("lhci/url/");
		});
	});

	describe("tasks", () => {
		it("includes audit with knip and performance", () => {
			const { tasks } = nextjs();
			const audit = tasks.find((w) => typeof w !== "string" && w.name === "audit");
			expect(audit).toMatchObject({ name: "audit", with: { "run-knip": true, "run-performance": true } });
		});

		it("includes test with storybook, interaction, and user-flow", () => {
			const { tasks } = nextjs();
			const test = tasks.find((w) => typeof w !== "string" && w.name === "test");
			expect(test).toMatchObject({
				name: "test",
				with: { "run-storybook": true, "run-interaction": true, "run-user-flow": true, "run-unit": false },
			});
		});

		it("merges test overrides into the single test entry", () => {
			const { tasks } = nextjs({ test: { "wait-on-url": "http://localhost:3000", "run-chromatic": true } });
			const test = tasks.find((w) => typeof w !== "string" && w.name === "test");
			expect(test).toMatchObject({
				name: "test",
				with: {
					"run-unit": false,
					"run-storybook": true,
					"run-interaction": true,
					"run-user-flow": true,
					"wait-on-url": "http://localhost:3000",
					"run-chromatic": true,
				},
			});
			expect(tasks.filter((w) => typeof w !== "string" && w.name === "test")).toHaveLength(1);
		});
	});
});

describe("react()", () => {
	describe("providers", () => {
		it("does not include vercel deployment", () => {
			const { providers } = react();
			expect(providers.deployment).toBeUndefined();
		});

		it("sets github secrets", () => {
			const { providers } = react();
			expect(providers.secrets).toBe("github");
		});
	});

	describe("tasks", () => {
		it("includes test without run-user-flow", () => {
			const { tasks } = react();
			const test = tasks.find((w) => typeof w !== "string" && w.name === "test");
			expect(test).toMatchObject({ name: "test", with: { "run-storybook": true, "run-interaction": true } });
			expect(test).not.toMatchObject({ with: { "run-user-flow": expect.anything() } });
		});
	});
});

describe("audit() capability", () => {
	it("contributes a required audit task when no options given", () => {
		const cap = audit();
		expect(cap.tasks).toContainEqual({ name: "audit", required: true });
	});

	it("contributes a required audit task with run-knip when knip: true", () => {
		const cap = audit({ knip: true });
		expect(cap.tasks).toContainEqual({ name: "audit", required: true, with: { "run-knip": true } });
	});

	it("contributes a required audit task with run-performance when performance: true", () => {
		const cap = audit({ performance: true });
		expect(cap.tasks).toContainEqual({ name: "audit", required: true, with: { "run-performance": true } });
	});

	it("includes lighthouseConfig in with block", () => {
		const cap = audit({ knip: true, performance: true, lighthouseConfig: "lighthouse.config.cjs" });
		expect(cap.tasks).toContainEqual({
			name: "audit",
			required: true,
			with: { "run-knip": true, "run-performance": true, "lighthouse-config": "lighthouse.config.cjs" },
		});
	});
});

describe("nodeDocsSite()", () => {
	it("sets org and domain", () => {
		const { org, domain } = nodeDocsSite();
		expect(org).toBe("theholocron");
		expect(domain).toBe("theholocron.dev");
	});

	it("does not include typecheck or audit tasks", () => {
		const { tasks } = nodeDocsSite();
		const names = tasks.map((w) => (typeof w === "string" ? w : w.name));
		expect(names).not.toContain("typecheck");
		expect(names).not.toContain("audit");
	});

	it("includes deploy with docs and preview", () => {
		const { tasks } = nodeDocsSite();
		const deploy = tasks.find((w) => typeof w !== "string" && w.name === "deploy");
		expect(deploy).toMatchObject({ name: "deploy", with: { docs: true, preview: true } });
	});

	it("does not carry Typecheck or audit required checks", () => {
		const preset = nodeDocsSite();
		const names = preset.tasks.map((t) => (typeof t === "string" ? t : t.name));
		expect(names).not.toContain("typecheck");
		expect(preset.extraRequiredChecks).not.toContain("audit / Conclusion");
	});
});

describe("monorepoCapability()", () => {
	it("sets uses_external_packages to true when composed", () => {
		const { repo } = compose(node(), monorepoCapability());
		expect(repo.properties?.uses_external_packages).toBe(true);
	});
});

describe("monorepo()", () => {
	it("wraps nextjs() and sets uses_external_packages to true", () => {
		const { repo } = monorepo(nextjs());
		expect(repo.properties?.uses_external_packages).toBe(true);
	});

	it("wraps react() and preserves browser runtime", () => {
		const { repo } = monorepo(react());
		expect(repo.properties?.runtime_environment).toBe("browser");
		expect(repo.properties?.uses_external_packages).toBe(true);
	});

	it("wraps nodeDocs() and preserves org and domain", () => {
		const result = monorepo(nodeDocs());
		expect(result.org).toBe("theholocron");
		expect(result.domain).toBe("theholocron.dev");
	});
});

describe("wiki() capability", () => {
	it("has id 'wiki'", () => {
		expect(wiki().id).toBe("wiki");
	});

	it("sets wiki provider to fern with theholocron domain", () => {
		const { providers } = wiki();
		expect(providers?.wiki).toMatchObject(["fern", { domain: "wiki.theholocron.dev", fernOrg: "holocron" }]);
	});

	it("includes wiki workflow", () => {
		const tasks = (wiki().tasks ?? []).map((w) => (typeof w === "string" ? w : w.name));
		expect(tasks).toContain("wiki");
	});
});

describe("the node preset (the ./presets/node subpath)", () => {
	it("is the node() capability composed on its own", () => {
		expect(nodePreset()).toEqual(compose(node()));
	});
});
