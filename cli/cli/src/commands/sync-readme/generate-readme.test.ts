import { describe, expect, it } from "vitest";

import { generateReadme } from "./generate-readme.js";
import type { RepoTemplateConfig } from "./generate-readme.type.js";

const baseConfig: RepoTemplateConfig = {
	description: "TypeScript clients for popular APIs.",
	homepage: "https://docs.theholocron.dev/clients",
	scripts: {
		build: "turbo run build",
		lint: "turbo run lint",
		test: "turbo run test",
		typecheck: "turbo run typecheck",
		release: "semantic-release",
		prepare: "husky",
	},
};

const mockPackages: RepoTemplateConfig["packages"] = {
	"github-client": {
		package: "@theholocron/github-client",
		docsUrl: "https://docs.theholocron.dev/clients/github",
		npmUrl: "https://www.npmjs.com/package/@theholocron/github-client",
	},
	"sentry-client": {
		package: "@theholocron/sentry-client",
		docsUrl: "https://docs.theholocron.dev/clients/sentry",
		npmUrl: "https://www.npmjs.com/package/@theholocron/sentry-client",
	},
};

describe("generateReadme", () => {
	it("always returns description, development, and releases", () => {
		const sections = generateReadme(baseConfig);
		expect(sections.description).toBeDefined();
		expect(sections.development).toBeDefined();
		expect(sections.releases).toBeDefined();
	});

	it("passes description through unchanged", () => {
		const sections = generateReadme(baseConfig);
		expect(sections.description).toBe("TypeScript clients for popular APIs.");
	});

	it("omits packages when not provided", () => {
		const sections = generateReadme(baseConfig);
		expect(sections.packages).toBeUndefined();
	});

	it("omits installation when not provided", () => {
		const sections = generateReadme(baseConfig);
		expect(sections.installation).toBeUndefined();
	});

	it("includes packages when provided", () => {
		const sections = generateReadme({ ...baseConfig, packages: mockPackages });
		expect(sections.packages).toBeDefined();
	});

	it("includes installation when provided", () => {
		const sections = generateReadme({ ...baseConfig, installation: "@theholocron/cli" });
		expect(sections.installation).toBeDefined();
	});

	it("can include both packages and installation", () => {
		const sections = generateReadme({
			...baseConfig,
			packages: mockPackages,
			installation: "@theholocron/cli",
		});
		expect(sections.packages).toBeDefined();
		expect(sections.installation).toBeDefined();
	});

	describe("packages section", () => {
		it("renders a table header", () => {
			const { packages } = generateReadme({ ...baseConfig, packages: mockPackages });
			expect(packages).toContain("| Package | Docs | npm |");
		});

		it("renders a row for each entry", () => {
			const { packages } = generateReadme({ ...baseConfig, packages: mockPackages });
			expect(packages).toContain("`@theholocron/github-client`");
			expect(packages).toContain("`@theholocron/sentry-client`");
		});

		it("links docs and npm URLs", () => {
			const { packages } = generateReadme({ ...baseConfig, packages: mockPackages });
			expect(packages).toContain("[Docs](https://docs.theholocron.dev/clients/github)");
			expect(packages).toContain("[npm](https://www.npmjs.com/package/@theholocron/github-client)");
		});
	});

	describe("installation section", () => {
		it("renders a pnpm add command", () => {
			const { installation } = generateReadme({
				...baseConfig,
				installation: "@theholocron/cli",
			});
			expect(installation).toContain("pnpm add @theholocron/cli");
		});

		it("wraps in a fenced code block", () => {
			const { installation } = generateReadme({
				...baseConfig,
				installation: "@theholocron/cli",
			});
			expect(installation).toMatch(/^```sh\n/);
			expect(installation).toMatch(/\n```$/);
		});
	});

	describe("development section", () => {
		it("renders a table header", () => {
			const { development } = generateReadme(baseConfig);
			expect(development).toContain("| Script | Command |");
		});

		it("includes allowed scripts", () => {
			const { development } = generateReadme(baseConfig);
			expect(development).toContain("`pnpm build`");
			expect(development).toContain("`pnpm test`");
			expect(development).toContain("`pnpm lint`");
			expect(development).toContain("`pnpm typecheck`");
		});

		it("omits disallowed scripts", () => {
			const { development } = generateReadme(baseConfig);
			expect(development).not.toContain("`pnpm release`");
			expect(development).not.toContain("`pnpm prepare`");
		});

		it("renders scripts in canonical order regardless of input order", () => {
			const config: RepoTemplateConfig = {
				...baseConfig,
				scripts: { typecheck: "tsc", build: "turbo run build", audit: "knip" },
			};
			const { development } = generateReadme(config);
			const buildPos = development.indexOf("pnpm build");
			const typecheckPos = development.indexOf("pnpm typecheck");
			const auditPos = development.indexOf("pnpm audit");
			expect(buildPos).toBeLessThan(typecheckPos);
			expect(typecheckPos).toBeLessThan(auditPos);
		});

		it("includes the raw command value", () => {
			const { development } = generateReadme(baseConfig);
			expect(development).toContain("`turbo run build`");
		});
	});

	describe("releases section", () => {
		it("links to semantic-release", () => {
			const { releases } = generateReadme(baseConfig);
			expect(releases).toContain("semantic-release");
		});

		it("uses the homepage to construct the releases URL", () => {
			const { releases } = generateReadme(baseConfig);
			expect(releases).toContain("https://docs.theholocron.dev/clients/releases");
		});

		it("strips a trailing slash from homepage before appending /releases", () => {
			const { releases } = generateReadme({
				...baseConfig,
				homepage: "https://docs.theholocron.dev/clients/",
			});
			expect(releases).toContain("https://docs.theholocron.dev/clients/releases");
			expect(releases).not.toContain("clients//releases");
		});

		it("links to CHANGELOG.md", () => {
			const { releases } = generateReadme(baseConfig);
			expect(releases).toContain("[CHANGELOG.md](./CHANGELOG.md)");
		});
	});
});
