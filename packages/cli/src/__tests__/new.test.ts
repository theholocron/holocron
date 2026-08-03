import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
	execFileSync: vi.fn(),
	spawnSync: vi.fn(() => ({ status: 0, error: undefined })),
}));
vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return { ...actual, existsSync: vi.fn(() => false), mkdirSync: vi.fn(), writeFileSync: vi.fn() };
});

import {
	deriveVariants,
	generateHolocronConfig,
	NewError,
	parseTopics,
	runNew,
	type RuntimeEnvironment,
	validateRepoName,
} from "../commands/new.js";

// ── Helpers ───────────────────────────────────────────────────────────

interface FakeFile {
	content: string;
	binary?: boolean;
}

function makeFs(files: Record<string, FakeFile> = {}) {
	const written: Record<string, string> = {};

	const readFile = (p: string): string => {
		const f = files[p];
		if (!f) throw new Error(`ENOENT: ${p}`);
		return f.content;
	};

	const writeFile = (p: string, c: string) => {
		written[p] = c;
	};

	const walkFiles = (_dir: string): string[] => Object.keys(files);

	return { readFile, writeFile, walkFiles, written };
}

function makeExec() {
	const calls: Array<{ cmd: string; args: string[] }> = [];
	const exec = (cmd: string, args: string[]) => {
		calls.push({ cmd, args });
	};
	return { exec, calls };
}

const BASE = {
	type: "cli",
	name: "my-tool",
	cwd: "/workspace",
};

// ── validateRepoName ──────────────────────────────────────────────────

describe("validateRepoName", () => {
	it("returns true for valid kebab-case names", () => {
		expect(validateRepoName("my-tool")).toBe(true);
		expect(validateRepoName("a")).toBe(true);
		expect(validateRepoName("my-long-tool-name-123")).toBe(true);
	});

	it("returns an error string for names that do not match kebab-case", () => {
		expect(validateRepoName("MyTool")).toMatch(/kebab-case/);
		expect(validateRepoName("my_tool")).toMatch(/kebab-case/);
		expect(validateRepoName("")).toMatch(/kebab-case/);
		expect(validateRepoName("123-tool")).toMatch(/kebab-case/);
	});
});

// ── parseTopics ───────────────────────────────────────────────────────

describe("parseTopics", () => {
	it("parses comma-separated topics and trims whitespace", () => {
		expect(parseTopics("typescript,nodejs")).toEqual(["typescript", "nodejs"]);
		expect(parseTopics("typescript , nodejs ")).toEqual(["typescript", "nodejs"]);
	});

	it("returns an empty array for undefined or empty input", () => {
		expect(parseTopics(undefined)).toEqual([]);
		expect(parseTopics("")).toEqual([]);
	});

	it("filters out blank segments from extra commas", () => {
		expect(parseTopics(",,,")).toEqual([]);
		expect(parseTopics("a,,b")).toEqual(["a", "b"]);
	});
});

// ── deriveVariants ────────────────────────────────────────────────────

describe("deriveVariants", () => {
	it("produces all six casing forms for a two-word slug", () => {
		const variants = deriveVariants("cli-template", "my-tool");
		const map = Object.fromEntries(variants);
		expect(map["cli-template"]).toBe("my-tool");
		expect(map["cli_template"]).toBe("my_tool");
		expect(map["CLI_TEMPLATE"]).toBe("MY_TOOL");
		expect(map["CliTemplate"]).toBe("MyTool");
		expect(map["cliTemplate"]).toBe("myTool");
		expect(map["Cli Template"]).toBe("My Tool");
	});

	it("deduplicates single-word slugs", () => {
		const variants = deriveVariants("cli", "app");
		const searches = variants.map(([s]) => s);
		const unique = new Set(searches);
		expect(searches.length).toBe(unique.size);
	});

	it("handles three-word slugs", () => {
		const variants = deriveVariants("nextjs-app-template", "my-awesome-project");
		const map = Object.fromEntries(variants);
		expect(map["nextjs-app-template"]).toBe("my-awesome-project");
		expect(map["NEXTJS_APP_TEMPLATE"]).toBe("MY_AWESOME_PROJECT");
		expect(map["NextjsAppTemplate"]).toBe("MyAwesomeProject");
	});
});

// ── runNew — dry-run ──────────────────────────────────────────────────

describe("runNew — dry-run", () => {
	it("returns dry-run status and calls no exec", async () => {
		const { exec, calls } = makeExec();
		const report = await runNew({
			...BASE,
			dryRun: true,
			exec,
			print: () => {},
		});
		expect(report.status).toBe("dry-run");
		expect(calls).toHaveLength(0);
	});

	it("prints what would happen including the template repo", async () => {
		const lines: string[] = [];
		await runNew({
			...BASE,
			description: "A cool tool",
			dryRun: true,
			exec: () => {},
			print: (l) => lines.push(l),
		});
		expect(lines.some((l) => l.includes("theholocron/cli-template"))).toBe(true);
		expect(lines.some((l) => l.includes("theholocron/my-tool"))).toBe(true);
		expect(lines.some((l) => l.includes("A cool tool"))).toBe(true);
	});

	it("prints runtime_environment replacement in dry-run when provided", async () => {
		const lines: string[] = [];
		await runNew({
			...BASE,
			runtimeEnvironment: "browser",
			dryRun: true,
			exec: () => {},
			print: (l) => lines.push(l),
		});
		expect(lines.some((l) => l.includes("<runtime_environment>") && l.includes("browser"))).toBe(true);
	});

	it("respects a custom org", async () => {
		const lines: string[] = [];
		await runNew({
			...BASE,
			org: "myorg",
			dryRun: true,
			exec: () => {},
			print: (l) => lines.push(l),
		});
		expect(lines.some((l) => l.includes("myorg/cli-template"))).toBe(true);
		expect(lines.some((l) => l.includes("myorg/my-tool"))).toBe(true);
	});
});

// ── runNew — happy path ───────────────────────────────────────────────

describe("runNew — happy path", () => {
	it("calls gh repo create with correct args", async () => {
		const { exec, calls } = makeExec();
		const { readFile, writeFile, walkFiles } = makeFs({
			"/workspace/my-tool/package.json": { content: JSON.stringify({ name: "@theholocron/cli-template" }) },
			"/workspace/my-tool/README.md": { content: "# cli-template\n\nA cli template." },
		});

		await runNew({
			...BASE,
			exec,
			readFile,
			writeFile,
			walkFiles,
			print: () => {},
		});

		const ghCall = calls.find((c) => c.cmd === "gh");
		expect(ghCall).toBeDefined();
		expect(ghCall?.args).toContain("--template=theholocron/cli-template");
		expect(ghCall?.args).toContain("theholocron/my-tool");
		expect(ghCall?.args).toContain("--private");
		expect(ghCall?.args).toContain("--clone");
	});

	it("patches text files replacing template slug with new name", async () => {
		const { exec } = makeExec();
		const { readFile, writeFile, walkFiles, written } = makeFs({
			"/workspace/my-tool/package.json": {
				content: JSON.stringify({ name: "@theholocron/cli-template", description: "<description>" }),
			},
			"/workspace/my-tool/README.md": {
				content: "# cli-template\n\nA cli-template project.",
			},
		});

		await runNew({
			...BASE,
			description: "My cool tool",
			exec,
			readFile,
			writeFile,
			walkFiles,
			print: () => {},
		});

		expect(written["/workspace/my-tool/README.md"]).toContain("my-tool");
		expect(written["/workspace/my-tool/README.md"]).not.toContain("cli-template");
		expect(written["/workspace/my-tool/package.json"]).toContain("My cool tool");
	});

	it("detects template slug from cloned package.json", async () => {
		const { exec } = makeExec();
		const { readFile, writeFile, walkFiles, written } = makeFs({
			"/workspace/my-tool/package.json": {
				content: JSON.stringify({ name: "@theholocron/react-template" }),
			},
			"/workspace/my-tool/src/index.ts": {
				content: "// react-template entry\nexport const ReactTemplate = {};",
			},
		});

		await runNew({
			...BASE,
			type: "react",
			exec,
			readFile,
			writeFile,
			walkFiles,
			print: () => {},
		});

		expect(written["/workspace/my-tool/src/index.ts"]).toContain("my-tool");
		expect(written["/workspace/my-tool/src/index.ts"]).not.toContain("react-template");
	});

	it("falls back to derived slug when package.json name is empty", async () => {
		const { existsSync } = await import("node:fs");
		// first call: repoDir doesn't exist → proceed; second call: pkgJsonPath exists → enter try block
		vi.mocked(existsSync).mockReturnValueOnce(false).mockReturnValueOnce(true);

		const { exec } = makeExec();
		const { readFile, writeFile, walkFiles } = makeFs({
			"/workspace/my-tool/package.json": { content: JSON.stringify({ name: "" }) },
			"/workspace/my-tool/README.md": { content: "# cli-template" },
		});
		const lines: string[] = [];

		await runNew({ ...BASE, exec, readFile, writeFile, walkFiles, print: (l) => lines.push(l) });

		// Falls back to "<type>-template" slug so "cli-template" appears in the detected slug message
		expect(lines.some((l) => l.includes("cli-template"))).toBe(true);
	});

	it("commits patched files with -s for DCO", async () => {
		const { exec, calls } = makeExec();
		const { readFile, writeFile, walkFiles } = makeFs({
			"/workspace/my-tool/package.json": {
				content: JSON.stringify({ name: "@theholocron/cli-template" }),
			},
			"/workspace/my-tool/README.md": { content: "# cli-template" },
		});

		await runNew({ ...BASE, exec, readFile, writeFile, walkFiles, print: () => {} });

		const commitCall = calls.find((c) => c.cmd === "git" && c.args.includes("commit"));
		expect(commitCall?.args).toContain("-s");
		expect(commitCall?.args).toContain("-m");
		expect(commitCall?.args.join(" ")).toContain("bootstrap from cli-template");
	});

	it("returns fail status when pnpm install throws", async () => {
		const { readFile, writeFile, walkFiles } = makeFs({
			"/workspace/my-tool/package.json": { content: JSON.stringify({ name: "@theholocron/cli-template" }) },
		});
		const exec = (cmd: string, args: string[]) => {
			if (cmd === "pnpm" && args.includes("install")) throw new Error("disk full");
		};
		const lines: string[] = [];
		const report = await runNew({ ...BASE, exec, readFile, writeFile, walkFiles, print: (l) => lines.push(l) });
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/pnpm install failed/);
		expect(lines.some((l) => l.includes("disk full"))).toBe(true);
	});

	it("continues with ok status when holocron setup throws", async () => {
		const { readFile, writeFile, walkFiles } = makeFs({
			"/workspace/my-tool/package.json": { content: JSON.stringify({ name: "@theholocron/cli-template" }) },
		});
		const exec = (cmd: string) => {
			if (cmd === "holocron") throw new Error("setup exploded");
		};
		const lines: string[] = [];
		const report = await runNew({ ...BASE, exec, readFile, writeFile, walkFiles, print: (l) => lines.push(l) });
		expect(report.status).toBe("ok");
		expect(lines.some((l) => l.includes("holocron setup failed"))).toBe(true);
	});

	it("runs pnpm install and holocron setup unless --no-verify", async () => {
		const { exec, calls } = makeExec();
		const { readFile, writeFile, walkFiles } = makeFs({
			"/workspace/my-tool/package.json": { content: JSON.stringify({ name: "@theholocron/cli-template" }) },
		});

		await runNew({ ...BASE, exec, readFile, writeFile, walkFiles, print: () => {} });
		expect(calls.some((c) => c.cmd === "pnpm" && c.args.includes("install"))).toBe(true);
		expect(calls.some((c) => c.cmd === "holocron" && c.args.includes("setup"))).toBe(true);
	});

	it("skips pnpm install and holocron setup when noVerify is true", async () => {
		const { exec, calls } = makeExec();
		const { readFile, writeFile, walkFiles } = makeFs({
			"/workspace/my-tool/package.json": { content: JSON.stringify({ name: "@theholocron/cli-template" }) },
		});

		await runNew({ ...BASE, noVerify: true, exec, readFile, writeFile, walkFiles, print: () => {} });
		expect(calls.some((c) => c.cmd === "pnpm" && c.args.includes("install"))).toBe(false);
		expect(calls.some((c) => c.cmd === "holocron" && c.args.includes("setup"))).toBe(false);
	});

	it("returns ok status with repoDir and filesPatched", async () => {
		const { exec } = makeExec();
		const { readFile, writeFile, walkFiles } = makeFs({
			"/workspace/my-tool/package.json": { content: JSON.stringify({ name: "@theholocron/cli-template" }) },
			"/workspace/my-tool/README.md": { content: "# cli-template" },
		});

		const report = await runNew({ ...BASE, exec, readFile, writeFile, walkFiles, print: () => {} });
		expect(report.status).toBe("ok");
		expect(report.repoDir).toBe("/workspace/my-tool");
		expect(report.filesPatched).toHaveLength(2);
	});
});

// ── runNew — error cases ──────────────────────────────────────────────

describe("runNew — errors", () => {
	it("throws NewError when repoDir already exists", async () => {
		const { existsSync } = await import("node:fs");
		vi.mocked(existsSync).mockReturnValueOnce(true);

		await expect(
			runNew({ ...BASE, exec: () => {}, readFile: () => "", walkFiles: () => [], print: () => {} })
		).rejects.toThrow(NewError);
	});

	it("throws NewError when gh repo create fails", async () => {
		const { existsSync } = await import("node:fs");
		vi.mocked(existsSync).mockReturnValue(false);

		await expect(
			runNew({
				...BASE,
				exec: (cmd) => {
					if (cmd === "gh") throw new Error("repository not found");
				},
				readFile: () => "",
				walkFiles: () => [],
				print: () => {},
			})
		).rejects.toThrow(NewError);
	});
});

// ── runNew — homepage ─────────────────────────────────────────────────

describe("runNew — homepage placeholder", () => {
	it("replaces <homepage> in template files", async () => {
		const { exec } = makeExec();
		const { readFile, writeFile, walkFiles, written } = makeFs({
			"/workspace/my-tool/package.json": { content: JSON.stringify({ name: "@theholocron/cli-template" }) },
			"/workspace/my-tool/README.md": { content: "Homepage: <homepage>" },
		});

		await runNew({
			...BASE,
			homepage: "https://docs.example.com/my-tool/",
			exec,
			readFile,
			writeFile,
			walkFiles,
			print: () => {},
		});

		expect(written["/workspace/my-tool/README.md"]).toContain("https://docs.example.com/my-tool/");
		expect(written["/workspace/my-tool/README.md"]).not.toContain("<homepage>");
	});

	it("skips <homepage> substitution when homepage is not provided", async () => {
		const { exec } = makeExec();
		const { readFile, writeFile, walkFiles, written } = makeFs({
			"/workspace/my-tool/package.json": { content: JSON.stringify({ name: "@theholocron/cli-template" }) },
			"/workspace/my-tool/README.md": { content: "Homepage: <homepage>" },
		});

		await runNew({ ...BASE, exec, readFile, writeFile, walkFiles, print: () => {} });

		expect(written["/workspace/my-tool/README.md"]).toBeUndefined();
	});
});

// ── runNew — holocron.config.ts generation ────────────────────────────

describe("runNew — holocron.config.ts", () => {
	it("writes a holocron.config.ts to the new repo dir", async () => {
		const { exec } = makeExec();
		const { readFile, writeFile, walkFiles, written } = makeFs({
			"/workspace/my-tool/package.json": { content: JSON.stringify({ name: "@theholocron/cli-template" }) },
		});

		await runNew({ ...BASE, exec, readFile, writeFile, walkFiles, print: () => {} });

		expect(written["/workspace/my-tool/holocron.config.ts"]).toBeDefined();
		expect(written["/workspace/my-tool/holocron.config.ts"]).toContain("defineConfig");
		expect(written["/workspace/my-tool/holocron.config.ts"]).toContain("node()");
	});

	it("includes the vault provider when specified", async () => {
		const { exec } = makeExec();
		const { readFile, writeFile, walkFiles, written } = makeFs({
			"/workspace/my-tool/package.json": { content: JSON.stringify({ name: "@theholocron/cli-template" }) },
		});

		await runNew({
			...BASE,
			vaultProvider: "doppler",
			vaultProject: "my-tool",
			vaultConfig: "dev",
			exec,
			readFile,
			writeFile,
			walkFiles,
			print: () => {},
		});

		const config = written["/workspace/my-tool/holocron.config.ts"];
		expect(config).toContain(`"doppler"`);
		expect(config).toContain(`"my-tool"`);
		expect(config).toContain(`"dev"`);
	});
});

// ── generateHolocronConfig ─────────────────────────────────────────────

describe("generateHolocronConfig", () => {
	it("produces a valid TypeScript module with the node preset", () => {
		const out = generateHolocronConfig({ name: "my-tool", type: "node" });
		expect(out).toContain(`import { defineConfig } from "@theholocron/cli"`);
		expect(out).toContain(`import { node } from "@theholocron/holocron-config"`);
		expect(out).toContain(`node()`);
		expect(out).toContain(`defineConfig(`);
	});

	it("includes description and homepage when provided", () => {
		const out = generateHolocronConfig({
			name: "my-tool",
			type: "node",
			description: "A cool tool",
			homepage: "https://docs.example.com/my-tool/",
		});
		expect(out).toContain(`"A cool tool"`);
		expect(out).toContain(`"https://docs.example.com/my-tool/"`);
	});

	it("spreads topics into the repo object", () => {
		const out = generateHolocronConfig({ name: "my-tool", type: "node", topics: ["typescript", "nodejs"] });
		expect(out).toContain(`topics:`);
		expect(out).toContain(`"typescript"`);
		expect(out).toContain(`"nodejs"`);
		expect(out).toContain(`...repo`);
	});

	it("omits the topics block when topics are empty", () => {
		const out = generateHolocronConfig({ name: "my-tool", type: "node", topics: [] });
		expect(out).toContain(`repo,`);
		expect(out).not.toContain(`topics:`);
	});

	it("wires in doppler vault with project + config", () => {
		const out = generateHolocronConfig({
			name: "my-tool",
			type: "node",
			vaultProvider: "doppler",
			vaultProject: "my-tool",
			vaultConfig: "dev",
		});
		expect(out).toContain(`["doppler",`);
		expect(out).toContain(`"my-tool"`);
		expect(out).toContain(`"dev"`);
		expect(out).toContain(`...providers`);
	});

	it("defaults vault project to the repo name when not specified", () => {
		const out = generateHolocronConfig({ name: "my-tool", type: "node", vaultProvider: "doppler" });
		expect(out).toContain(`"my-tool"`);
	});

	it("wires in 1password vault", () => {
		const out = generateHolocronConfig({
			name: "my-tool",
			type: "node",
			vaultProvider: "1password",
			vaultProject: "My Vault",
		});
		expect(out).toContain(`["1password",`);
		expect(out).toContain(`"My Vault"`);
	});

	it("wires in infisical vault", () => {
		const out = generateHolocronConfig({
			name: "my-tool",
			type: "node",
			vaultProvider: "infisical",
			vaultProject: "my-proj",
		});
		expect(out).toContain(`["infisical",`);
		expect(out).toContain(`"my-proj"`);
	});

	it("wires in vercel deployment", () => {
		const out = generateHolocronConfig({
			name: "my-tool",
			type: "node",
			deploymentProvider: "vercel",
		});
		expect(out).toContain(`deployment: "vercel"`);
	});

	it("sets the agent field when provided", () => {
		const out = generateHolocronConfig({ name: "my-tool", type: "node", agent: "claude" });
		expect(out).toContain(`agent: "claude"`);
	});

	it("omits the agent field when none", () => {
		const out = generateHolocronConfig({ name: "my-tool", type: "node", agent: "none" });
		expect(out).not.toContain(`agent:`);
	});

	it("uses plain providers when no vault or deployment is selected", () => {
		const out = generateHolocronConfig({ name: "my-tool", type: "node", vaultProvider: "none" });
		expect(out).toContain(`providers,`);
		expect(out).not.toContain(`...providers`);
	});

	it("generates full explicit repo block when org is provided", () => {
		const out = generateHolocronConfig({ name: "my-tool", type: "node", org: "theholocron" });
		expect(out).toContain(`name: "theholocron/my-tool"`);
		expect(out).toContain(`teams: [{ slug: "gatekeepers", permission: "maintain" }]`);
		expect(out).toContain(`topics:`);
		expect(out).toContain(`...repo`);
	});

	it("includes protection override when not strict", () => {
		const out = generateHolocronConfig({
			name: "my-tool",
			type: "node",
			org: "theholocron",
			protection: "balanced",
		});
		expect(out).toContain(`protection: "balanced"`);
	});

	it("omits protection override when strict (preset default)", () => {
		const out = generateHolocronConfig({ name: "my-tool", type: "node", org: "theholocron", protection: "strict" });
		expect(out).not.toContain(`protection:`);
	});

	it("includes properties overrides for open_source false", () => {
		const out = generateHolocronConfig({ name: "my-tool", type: "node", org: "theholocron", openSource: false });
		expect(out).toContain(`open_source: false`);
	});

	it("includes properties overrides for uses_external_packages false", () => {
		const out = generateHolocronConfig({
			name: "my-tool",
			type: "node",
			org: "theholocron",
			usesExternalPackages: false,
		});
		expect(out).toContain(`uses_external_packages: false`);
	});

	it("emits skills array when provided", () => {
		const out = generateHolocronConfig({ name: "my-tool", type: "node", skills: ["git-safety", "pr-workflow"] });
		expect(out).toContain(`skills: ["git-safety","pr-workflow"]`);
	});

	it("omits skills when empty", () => {
		const out = generateHolocronConfig({ name: "my-tool", type: "node", skills: [] });
		expect(out).not.toContain(`skills:`);
	});

	it("emits a properties override for non-node runtime environments", () => {
		const cases: RuntimeEnvironment[] = ["browser", "universal", "none"];
		for (const env of cases) {
			const out = generateHolocronConfig({ name: "my-tool", type: "node", runtimeEnvironment: env });
			expect(out).toContain(`runtime_environment: "${env}"`);
			expect(out).toContain(`...repo.properties`);
			expect(out).toContain(`...repo`);
		}
	});

	it("omits the properties override when runtimeEnvironment is node", () => {
		const out = generateHolocronConfig({ name: "my-tool", type: "node", runtimeEnvironment: "node" });
		expect(out).toContain(`repo,`);
		expect(out).not.toContain(`runtime_environment`);
	});

	it("combines topics and runtimeEnvironment in the repo block", () => {
		const out = generateHolocronConfig({
			name: "my-tool",
			type: "node",
			topics: ["typescript"],
			runtimeEnvironment: "browser",
		});
		expect(out).toContain(`topics:`);
		expect(out).toContain(`...repo`);
		expect(out).toContain(`runtime_environment: "browser"`);
	});
});

// ── runNew — runtime_environment placeholder ──────────────────────────

describe("runNew — runtime_environment placeholder", () => {
	it("replaces <runtime_environment> in template files", async () => {
		const { exec } = makeExec();
		const { readFile, writeFile, walkFiles, written } = makeFs({
			"/workspace/my-tool/package.json": { content: JSON.stringify({ name: "@theholocron/base-template" }) },
			"/workspace/my-tool/holocron.config.json": {
				content: JSON.stringify({ runtime_environment: "<runtime_environment>" }),
			},
		});

		await runNew({
			...BASE,
			type: "base",
			runtimeEnvironment: "none",
			exec,
			readFile,
			writeFile,
			walkFiles,
			print: () => {},
		});

		expect(written["/workspace/my-tool/holocron.config.json"]).toContain('"none"');
		expect(written["/workspace/my-tool/holocron.config.json"]).not.toContain("<runtime_environment>");
	});

	it("skips <runtime_environment> substitution when not provided", async () => {
		const { exec } = makeExec();
		const { readFile, writeFile, walkFiles, written } = makeFs({
			"/workspace/my-tool/package.json": { content: JSON.stringify({ name: "@theholocron/base-template" }) },
			"/workspace/my-tool/holocron.config.json": {
				content: JSON.stringify({ runtime_environment: "<runtime_environment>" }),
			},
		});

		await runNew({ ...BASE, type: "base", exec, readFile, writeFile, walkFiles, print: () => {} });

		expect(written["/workspace/my-tool/holocron.config.json"]).toBeUndefined();
	});
});
