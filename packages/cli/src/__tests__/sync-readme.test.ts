import { describe, expect, it, vi } from "vitest";

import { runSyncReadme } from "../commands/sync-readme.js";
import { resolveConfig } from "../config.js";
import type { LoadedConfig } from "../load-config.js";

function makeLoaded(overrides: Partial<Parameters<typeof resolveConfig>[0]> = {}): LoadedConfig {
	return {
		resolved: resolveConfig({
			name: "my-cli",
			providers: { source: "github" },
			...overrides,
		}),
		filepath: "/tmp/test/holocron.config.ts",
	};
}

function makeFs(files: Record<string, string>) {
	const written: Record<string, string> = {};
	const readFileFn = vi.fn(async (path: string) => {
		if (path in files) return files[path]!;
		throw new Error(`ENOENT: ${path}`);
	}) as unknown as (path: string, encoding: BufferEncoding) => Promise<string>;
	const writeFileFn = vi.fn(async (path: string, content: string) => {
		written[path] = content;
	}) as unknown as (path: string, content: string, encoding: BufferEncoding) => Promise<void>;
	return { readFileFn, writeFileFn, written };
}

const CLI_PKG = JSON.stringify({ name: "@scope/my-cli", bin: { "my-cli": "./dist/cli.mjs" } });
const LIB_PKG = JSON.stringify({ name: "@scope/my-lib" });
const REACT_PKG = JSON.stringify({ name: "@scope/my-react", peerDependencies: { react: "^19" } });
const MONOREPO_PKG = JSON.stringify({
	name: "@theholocron/clients",
	homepage: "https://docs.theholocron.dev/clients",
	workspaces: ["packages/*"],
	scripts: { build: "turbo run build", test: "turbo run test", release: "semantic-release" },
});
const SCRIPTS_PKG = JSON.stringify({
	name: "@scope/my-lib",
	homepage: "https://example.com",
	scripts: { build: "tsc", lint: "eslint .", test: "vitest run", release: "semantic-release" },
});

const README_WITH_MARKERS = [
	"# My CLI",
	"<!-- holocron:installation -->",
	"old content",
	"<!-- /holocron:installation -->",
	"## More",
].join("\n");

const README_WITH_DESC = [
	"# My CLI",
	"<!-- holocron:description -->",
	"A description.",
	"<!-- /holocron:description -->",
	"## Releases",
].join("\n");

const README_BARE = "# My CLI\n## Releases";

const README_WITH_SECTIONS = [
	"# Clients",
	"<!-- holocron:packages -->",
	"old packages",
	"<!-- /holocron:packages -->",
	"<!-- holocron:development -->",
	"old dev",
	"<!-- /holocron:development -->",
	"<!-- holocron:releases -->",
	"old releases",
	"<!-- /holocron:releases -->",
	"<!-- holocron:installation -->",
	"old install",
	"<!-- /holocron:installation -->",
].join("\n");

// --- runSyncReadme ---

describe("runSyncReadme", () => {
	it("returns fail when package.json cannot be read", async () => {
		const { readFileFn, writeFileFn } = makeFs({});
		const report = await runSyncReadme({
			loaded: makeLoaded(),
			context: { repoRoot: "/tmp/test" },
			print: () => {},
			readFileFn,
			writeFileFn,
		});
		expect(report).toMatchObject({ status: "fail", updated: false });
	});

	it("returns fail when README.md cannot be read or has no anchor", async () => {
		const { readFileFn, writeFileFn } = makeFs({ "/tmp/test/package.json": CLI_PKG });
		const report = await runSyncReadme({
			loaded: makeLoaded(),
			context: { repoRoot: "/tmp/test" },
			print: () => {},
			readFileFn,
			writeFileFn,
		});
		expect(report).toMatchObject({ status: "fail", updated: false });
	});

	it("replaces content between existing markers", async () => {
		const { readFileFn, writeFileFn, written } = makeFs({
			"/tmp/test/package.json": CLI_PKG,
			"/tmp/test/README.md": README_WITH_MARKERS,
		});
		const report = await runSyncReadme({
			loaded: makeLoaded(),
			context: { repoRoot: "/tmp/test" },
			print: () => {},
			readFileFn,
			writeFileFn,
		});
		expect(report).toMatchObject({ status: "ok", updated: true });
		expect(written["/tmp/test/README.md"]).toContain("npm install --global @scope/my-cli");
		expect(written["/tmp/test/README.md"]).toContain("my-cli --help");
		expect(written["/tmp/test/README.md"]).not.toContain("old content");
	});

	it("inserts markers after description block when none exist", async () => {
		const { readFileFn, writeFileFn, written } = makeFs({
			"/tmp/test/package.json": CLI_PKG,
			"/tmp/test/README.md": README_WITH_DESC,
		});
		const report = await runSyncReadme({
			loaded: makeLoaded(),
			context: { repoRoot: "/tmp/test" },
			print: () => {},
			readFileFn,
			writeFileFn,
		});
		expect(report).toMatchObject({ status: "ok", updated: true });
		expect(written["/tmp/test/README.md"]).toContain("<!-- holocron:installation -->");
		expect(written["/tmp/test/README.md"]).toContain("<!-- /holocron:installation -->");
	});

	it("inserts markers after h1 when no description block exists", async () => {
		const { readFileFn, writeFileFn, written } = makeFs({
			"/tmp/test/package.json": CLI_PKG,
			"/tmp/test/README.md": README_BARE,
		});
		const report = await runSyncReadme({
			loaded: makeLoaded(),
			context: { repoRoot: "/tmp/test" },
			print: () => {},
			readFileFn,
			writeFileFn,
		});
		expect(report).toMatchObject({ status: "ok", updated: true });
		expect(written["/tmp/test/README.md"]).toContain("<!-- holocron:installation -->");
	});

	it("does not write in dry-run mode (existing markers)", async () => {
		const { readFileFn, writeFileFn } = makeFs({
			"/tmp/test/package.json": CLI_PKG,
			"/tmp/test/README.md": README_WITH_MARKERS,
		});
		const report = await runSyncReadme({
			loaded: makeLoaded(),
			context: { repoRoot: "/tmp/test", dryRun: true },
			print: () => {},
			readFileFn,
			writeFileFn,
		});
		expect(report).toMatchObject({ status: "dry-run", updated: true });
		expect(writeFileFn).not.toHaveBeenCalled();
	});

	it("does not write in dry-run mode (no markers, inserts after h1)", async () => {
		const { readFileFn, writeFileFn } = makeFs({
			"/tmp/test/package.json": CLI_PKG,
			"/tmp/test/README.md": README_BARE,
		});
		const report = await runSyncReadme({
			loaded: makeLoaded(),
			context: { repoRoot: "/tmp/test", dryRun: true },
			print: () => {},
			readFileFn,
			writeFileFn,
		});
		expect(report).toMatchObject({ status: "dry-run", updated: true });
		expect(writeFileFn).not.toHaveBeenCalled();
	});

	it("skips packages lookup when package.json has no name", async () => {
		const { readFileFn, writeFileFn, written } = makeFs({
			"/tmp/test/package.json": JSON.stringify({ scripts: { build: "tsc" } }),
			"/tmp/test/README.md": README_WITH_MARKERS,
		});
		const report = await runSyncReadme({
			loaded: makeLoaded(),
			context: { repoRoot: "/tmp/test" },
			print: () => {},
			readFileFn,
			writeFileFn,
		});
		expect(report.status).toBe("ok");
		expect(written["/tmp/test/README.md"]).not.toContain("@theholocron");
	});

	it("returns fail when README has no h1 and no markers", async () => {
		const { readFileFn, writeFileFn } = makeFs({
			"/tmp/test/package.json": CLI_PKG,
			"/tmp/test/README.md": "No heading here at all.",
		});
		const report = await runSyncReadme({
			loaded: makeLoaded(),
			context: { repoRoot: "/tmp/test" },
			print: () => {},
			readFileFn,
			writeFileFn,
		});
		expect(report).toMatchObject({ status: "fail", updated: false });
	});

	it("prints namespaces when env.namespaces is configured", async () => {
		const printed: string[] = [];
		const { readFileFn, writeFileFn } = makeFs({
			"/tmp/test/package.json": CLI_PKG,
			"/tmp/test/README.md": README_WITH_MARKERS,
		});
		await runSyncReadme({
			loaded: makeLoaded({ env: { namespaces: ["HOLOCRON", "MY_CLI"] } }),
			context: { repoRoot: "/tmp/test" },
			print: (l) => printed.push(l),
			readFileFn,
			writeFileFn,
		});
		expect(printed.some((l) => l.includes("HOLOCRON") && l.includes("MY_CLI"))).toBe(true);
	});

	// --- block generation by repo type ---

	it("generates npm install --global for CLI repos (has bin)", async () => {
		const { readFileFn, writeFileFn, written } = makeFs({
			"/tmp/test/package.json": CLI_PKG,
			"/tmp/test/README.md": README_WITH_MARKERS,
		});
		await runSyncReadme({
			loaded: makeLoaded(),
			context: { repoRoot: "/tmp/test" },
			print: () => {},
			readFileFn,
			writeFileFn,
		});
		expect(written["/tmp/test/README.md"]).toContain("npm install --global");
		expect(written["/tmp/test/README.md"]).toContain("my-cli --help");
	});

	it("generates pnpm install for library repos (no bin, no react peer)", async () => {
		const { readFileFn, writeFileFn, written } = makeFs({
			"/tmp/test/package.json": LIB_PKG,
			"/tmp/test/README.md": README_WITH_MARKERS,
		});
		await runSyncReadme({
			loaded: makeLoaded(),
			context: { repoRoot: "/tmp/test" },
			print: () => {},
			readFileFn,
			writeFileFn,
		});
		expect(written["/tmp/test/README.md"]).toContain("pnpm install");
		expect(written["/tmp/test/README.md"]).toContain("```typescript");
	});

	it("generates tsx snippet for React library repos (react peer dep)", async () => {
		const { readFileFn, writeFileFn, written } = makeFs({
			"/tmp/test/package.json": REACT_PKG,
			"/tmp/test/README.md": README_WITH_MARKERS,
		});
		await runSyncReadme({
			loaded: makeLoaded(),
			context: { repoRoot: "/tmp/test" },
			print: () => {},
			readFileFn,
			writeFileFn,
		});
		expect(written["/tmp/test/README.md"]).toContain("```tsx");
		expect(written["/tmp/test/README.md"]).toContain("function App()");
	});

	it("handles bin as a plain string", async () => {
		const pkg = JSON.stringify({ name: "@scope/my-cli", bin: "./dist/cli.mjs" });
		const { readFileFn, writeFileFn, written } = makeFs({
			"/tmp/test/package.json": pkg,
			"/tmp/test/README.md": README_WITH_MARKERS,
		});
		await runSyncReadme({
			loaded: makeLoaded(),
			context: { repoRoot: "/tmp/test" },
			print: () => {},
			readFileFn,
			writeFileFn,
		});
		expect(written["/tmp/test/README.md"]).toContain("npm install --global");
	});
});

// --- 4.3: packages, development, releases sections ---

it("writes development section when marker exists", async () => {
	const { readFileFn, writeFileFn, written } = makeFs({
		"/tmp/test/package.json": SCRIPTS_PKG,
		"/tmp/test/README.md": README_WITH_SECTIONS,
	});
	await runSyncReadme({
		loaded: makeLoaded({ description: "A lib.", homepage: "https://example.com" }),
		context: { repoRoot: "/tmp/test" },
		print: () => {},
		readFileFn,
		writeFileFn,
	});
	expect(written["/tmp/test/README.md"]).toContain("pnpm build");
	expect(written["/tmp/test/README.md"]).toContain("pnpm test");
	expect(written["/tmp/test/README.md"]).toContain("pnpm lint");
	expect(written["/tmp/test/README.md"]).not.toContain("pnpm release");
});

it("writes releases section when marker exists", async () => {
	const { readFileFn, writeFileFn, written } = makeFs({
		"/tmp/test/package.json": SCRIPTS_PKG,
		"/tmp/test/README.md": README_WITH_SECTIONS,
	});
	await runSyncReadme({
		loaded: makeLoaded({ description: "A lib.", homepage: "https://example.com" }),
		context: { repoRoot: "/tmp/test" },
		print: () => {},
		readFileFn,
		writeFileFn,
	});
	expect(written["/tmp/test/README.md"]).toContain("https://example.com/releases");
	expect(written["/tmp/test/README.md"]).toContain("CHANGELOG.md");
});

it("writes packages section for known monorepo", async () => {
	const { readFileFn, writeFileFn, written } = makeFs({
		"/tmp/test/package.json": MONOREPO_PKG,
		"/tmp/test/README.md": README_WITH_SECTIONS,
	});
	await runSyncReadme({
		loaded: makeLoaded({ description: "Clients.", homepage: "https://docs.theholocron.dev/clients" }),
		context: { repoRoot: "/tmp/test" },
		print: () => {},
		readFileFn,
		writeFileFn,
	});
	expect(written["/tmp/test/README.md"]).toContain("@theholocron/github-client");
});

it("silently skips sections whose markers are absent", async () => {
	const { readFileFn, writeFileFn, written } = makeFs({
		"/tmp/test/package.json": SCRIPTS_PKG,
		"/tmp/test/README.md": README_WITH_MARKERS,
	});
	await runSyncReadme({
		loaded: makeLoaded({ description: "A lib.", homepage: "https://example.com" }),
		context: { repoRoot: "/tmp/test" },
		print: () => {},
		readFileFn,
		writeFileFn,
	});
	// development/releases markers absent — README unchanged except installation
	expect(written["/tmp/test/README.md"]).not.toContain("<!-- holocron:development -->");
});

// --- 4.4: index.mdx frontmatter ---

it("updates index.mdx description when file exists", async () => {
	const mdxPath = "/tmp/test/docs/src/content/docs/index.mdx";
	const { readFileFn, writeFileFn, written } = makeFs({
		"/tmp/test/package.json": SCRIPTS_PKG,
		"/tmp/test/README.md": README_WITH_MARKERS,
		[mdxPath]: "---\ntitle: Overview\ndescription: old description\n---\n",
	});
	await runSyncReadme({
		loaded: makeLoaded({ description: "New description.", homepage: "https://example.com" }),
		context: { repoRoot: "/tmp/test" },
		print: () => {},
		readFileFn,
		writeFileFn,
	});
	expect(written[mdxPath]).toContain("description: New description.");
	expect(written[mdxPath]).not.toContain("old description");
});

it("skips index.mdx write when description already matches", async () => {
	const mdxPath = "/tmp/test/docs/src/content/docs/index.mdx";
	const { readFileFn, writeFileFn } = makeFs({
		"/tmp/test/package.json": SCRIPTS_PKG,
		"/tmp/test/README.md": README_WITH_MARKERS,
		[mdxPath]: "---\ntitle: Overview\ndescription: New description.\n---\n",
	});
	await runSyncReadme({
		loaded: makeLoaded({ description: "New description.", homepage: "https://example.com" }),
		context: { repoRoot: "/tmp/test" },
		print: () => {},
		readFileFn,
		writeFileFn,
	});
	expect(writeFileFn).not.toHaveBeenCalledWith(mdxPath, expect.anything(), expect.anything());
});

it("skips index.mdx update when file does not exist", async () => {
	const { readFileFn, writeFileFn, written } = makeFs({
		"/tmp/test/package.json": SCRIPTS_PKG,
		"/tmp/test/README.md": README_WITH_MARKERS,
	});
	await runSyncReadme({
		loaded: makeLoaded({ description: "New description.", homepage: "https://example.com" }),
		context: { repoRoot: "/tmp/test" },
		print: () => {},
		readFileFn,
		writeFileFn,
	});
	expect(Object.keys(written)).not.toContain("/tmp/test/docs/src/content/docs/index.mdx");
});

// --- config: EnvConfig ---

describe("EnvConfig in HolocronConfig", () => {
	it("resolveConfig passes env.namespaces through to resolved config", () => {
		const resolved = resolveConfig({
			name: "my-cli",
			providers: { source: "github" },
			env: { namespaces: ["HOLOCRON", "MY_CLI"] },
		});
		expect(resolved.env).toEqual({ namespaces: ["HOLOCRON", "MY_CLI"] });
	});

	it("resolved config has no env field when not set", () => {
		const resolved = resolveConfig({ name: "my-cli", providers: { source: "github" } });
		expect(resolved.env).toBeUndefined();
	});
});
