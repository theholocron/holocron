import { describe, expect, it, vi } from "vitest";

import { resolveConfig } from "../config.js";
import { runSyncReadme } from "../commands/sync-readme.js";
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

	it("does not write in dry-run mode", async () => {
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
