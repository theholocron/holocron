import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));
vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return { ...actual, mkdirSync: vi.fn(), writeFileSync: vi.fn() };
});

import { PluginCreateError, runPluginCreate } from "../commands/plugin-create/index.js";

// In-memory fs so tests don't touch the real workspace.
function makeFakeFs() {
	const written = new Map<string, string>();
	return {
		writeFile: (filepath: string, content: string) => {
			written.set(filepath, content);
		},
		get: (path: string) => written.get(path),
		has: (path: string) => written.has(path),
		paths: () => Array.from(written.keys()),
		size: () => written.size,
	};
}

// Derive the workspace root from this file's location — portable
// across local dev, CI, and any other check-out path.
//   packages/cli/src/__tests__/plugin-create.test.ts → up 4 → root
const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(HERE, "../../../..");

const BASE_INPUT = {
	slug: "nonexistent-fake-slug",
	vendorName: "FakeVendor",
	capability: "tooling" as const,
	vendorEnv: "FAKEVENDOR_KEY",
	baseUrl: "https://api.fakevendor.example",
	cwd: WORKSPACE_ROOT,
};

describe("runPluginCreate — orchestrator", () => {
	it("emits exactly 18 files (5 config + 1 readme + 5 source + 6 tests + 1 script)", () => {
		const fs = makeFakeFs();
		const report = runPluginCreate({
			...BASE_INPUT,
			writeFile: fs.writeFile,
			print: () => {},
		});
		expect(report.status).toBe("ok");
		expect(report.filesWritten).toHaveLength(18);
		expect(fs.size()).toBe(18);
	});

	it("resolves {{capability}} in paths to the chosen capability key", () => {
		const fs = makeFakeFs();
		runPluginCreate({
			...BASE_INPUT,
			capability: "vault",
			writeFile: fs.writeFile,
			print: () => {},
		});
		expect(fs.paths().some((p) => p.endsWith("src/capabilities/vault.ts"))).toBe(true);
		expect(fs.paths().some((p) => p.endsWith("src/__tests__/vault.test.ts"))).toBe(true);
		expect(fs.paths().every((p) => !p.includes("{{capability}}"))).toBe(true);
	});

	it("dry-run mode writes no files but reports what would be written", () => {
		const fs = makeFakeFs();
		const report = runPluginCreate({
			...BASE_INPUT,
			dryRun: true,
			writeFile: fs.writeFile,
			print: () => {},
		});
		expect(report.status).toBe("ok");
		expect(fs.size()).toBe(0);
		expect(report.filesWritten).toHaveLength(18);
	});

	it("preflight fails when CWD is not a workspace root", () => {
		expect(() =>
			runPluginCreate({
				...BASE_INPUT,
				cwd: "/tmp",
				writeFile: () => {},
				print: () => {},
			})
		).toThrow(PluginCreateError);
	});

	it("slug-collision guard fires when the target directory already exists", () => {
		expect(() =>
			runPluginCreate({
				...BASE_INPUT,
				slug: "doppler", // real package in the workspace
				writeFile: () => {},
				print: () => {},
			})
		).toThrow(/already exists/);
	});

	it("rejects an unknown capability key", () => {
		expect(() =>
			runPluginCreate({
				...BASE_INPUT,
				// @ts-expect-error deliberately invalid
				capability: "not-a-real-capability",
				writeFile: () => {},
				print: () => {},
			})
		).toThrow(/not a known capability/);
	});

	it("rejects a slug that isn't kebab-case", () => {
		expect(() =>
			runPluginCreate({
				...BASE_INPUT,
				slug: "MyPlugin", // PascalCase — invalid
				writeFile: () => {},
				print: () => {},
			})
		).toThrow(/invalid slug/);
	});

	it("rejects a slug that starts with a digit", () => {
		expect(() =>
			runPluginCreate({
				...BASE_INPUT,
				slug: "1password", // catches the env.HOLOCRON_1PASSWORD_TOKEN identifier trap
				writeFile: () => {},
				print: () => {},
			})
		).toThrow(/invalid slug/);
	});

	it("rejects a vendor name that isn't PascalCase", () => {
		expect(() =>
			runPluginCreate({
				...BASE_INPUT,
				vendorName: "myVendor", // starts lowercase
				writeFile: () => {},
				print: () => {},
			})
		).toThrow(/invalid vendor name/);
	});

	it("warns on many-cardinality capabilities without erroring", () => {
		const messages: string[] = [];
		const report = runPluginCreate({
			...BASE_INPUT,
			capability: "tooling", // 'many' cardinality
			dryRun: true,
			writeFile: () => {},
			print: (l) => messages.push(l),
		});
		expect(report.status).toBe("ok");
		expect(messages.some((m) => m.includes("many-cardinality"))).toBe(true);
	});
});

describe("Rendered content sanity", () => {
	it("package.json contains the plugin name, tsdown build, workspace peer dep", () => {
		const fs = makeFakeFs();
		runPluginCreate({
			...BASE_INPUT,
			slug: "acme",
			vendorName: "Acme",
			writeFile: fs.writeFile,
			print: () => {},
		});
		const pkg = fs.paths().find((p) => p.endsWith("package.json"));
		expect(pkg).toBeTruthy();
		const content = fs.get(pkg!)!;
		expect(content).toMatch(/@theholocron\/holocron-plugin-acme/);
		expect(content).toMatch(/"peerDependencies":\s*{\s*"@theholocron\/cli":/);
		expect(content).toMatch(/"build":\s*"tsdown"/);
	});

	it("auth.ts uses the 4-step precedence with keyring + custom env vars", () => {
		const fs = makeFakeFs();
		runPluginCreate({
			...BASE_INPUT,
			slug: "acme",
			vendorName: "Acme",
			vendorEnv: "ACME_KEY",
			writeFile: fs.writeFile,
			print: () => {},
		});
		const content = fs.get(fs.paths().find((p) => p.endsWith("src/auth.ts"))!)!;
		expect(content).toMatch(/HOLOCRON_ACME_TOKEN/);
		expect(content).toMatch(/ACME_KEY/);
		expect(content).toMatch(/createResolveToken/);
		expect(content).toMatch(/keyringService: "acme"/);
	});

	it("normalizes trailing slashes in baseUrl so the rest-test's assertion matches", () => {
		const fs = makeFakeFs();
		runPluginCreate({
			...BASE_INPUT,
			slug: "acme",
			vendorName: "Acme",
			baseUrl: "https://api.acme.example/v1///", // trailing slashes
			writeFile: fs.writeFile,
			print: () => {},
		});
		const restTest = fs.get(fs.paths().find((p) => p.endsWith("src/__tests__/rest.test.ts"))!)!;
		// The trimming test expects `client.baseUrl` to equal the normalized
		// URL. If baseUrl had leaked in with a trailing slash, the assertion
		// would embed it and fail against the client's own trim.
		expect(restTest).toContain('expect(client.baseUrl).toBe("https://api.acme.example/v1")');
		expect(restTest).not.toMatch(/toBe\("https:\/\/api\.acme\.example\/v1\/+/);
	});

	it("index.ts exports AUTH_HINT and verifyToken", () => {
		const fs = makeFakeFs();
		runPluginCreate({
			...BASE_INPUT,
			slug: "acme",
			vendorName: "Acme",
			writeFile: fs.writeFile,
			print: () => {},
		});
		const content = fs.get(fs.paths().find((p) => p.endsWith("src/index.ts"))!)!;
		expect(content).toMatch(/export const AUTH_HINT/);
		expect(content).toMatch(/export \{ verifyToken \}/);
		expect(content).toMatch(/holocron auth set acme/);
	});
});

// ── post-scaffold verify ──────────────────────────────────────────────────────

describe("runPluginCreate — post-scaffold verify", () => {
	it("skips verify when dryRun is true", () => {
		const fs = makeFakeFs();
		let execCalled = false;
		const report = runPluginCreate({
			...BASE_INPUT,
			writeFile: fs.writeFile,
			print: () => {},
			dryRun: true,
			exec: () => { execCalled = true; },
		});
		expect(execCalled).toBe(false);
		expect(report.status).toBe("ok");
	});

	it("skips verify when noVerify is true", () => {
		const fs = makeFakeFs();
		let execCalled = false;
		const report = runPluginCreate({
			...BASE_INPUT,
			writeFile: fs.writeFile,
			print: () => {},
			noVerify: true,
			exec: () => { execCalled = true; },
		});
		expect(execCalled).toBe(false);
		expect(report.status).toBe("ok");
	});

	it("runs pnpm install, typecheck, lint, test in order when verify is enabled", () => {
		const fs = makeFakeFs();
		const calls: string[] = [];
		const report = runPluginCreate({
			...BASE_INPUT,
			writeFile: fs.writeFile,
			print: () => {},
			exec: (cmd, args) => { calls.push(`${cmd} ${args.join(" ")}`); },
		});
		expect(calls).toEqual([
			`pnpm install --frozen-lockfile=false`,
			`pnpm --filter @theholocron/holocron-plugin-nonexistent-fake-slug typecheck`,
			`pnpm --filter @theholocron/holocron-plugin-nonexistent-fake-slug lint`,
			`pnpm --filter @theholocron/holocron-plugin-nonexistent-fake-slug test`,
		]);
		expect(report.status).toBe("ok");
	});

	it("returns fail when a verify step throws", () => {
		const fs = makeFakeFs();
		const lines: string[] = [];
		const report = runPluginCreate({
			...BASE_INPUT,
			writeFile: fs.writeFile,
			print: (l) => lines.push(l),
			exec: (_, args) => {
				if (args.includes("typecheck")) throw new Error("type error");
			},
		});
		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/verify failed/);
		expect(lines.join("\n")).toContain("✗ verify failed");
	});

	it("defaultWrite delegates to mkdirSync + writeFileSync when no writeFile is injected", async () => {
		const { mkdirSync, writeFileSync } = await import("node:fs");
		const mkdirMock = vi.mocked(mkdirSync);
		const writeMock = vi.mocked(writeFileSync);
		mkdirMock.mockImplementation(() => undefined);
		writeMock.mockImplementation(() => undefined);
		runPluginCreate({ ...BASE_INPUT, noVerify: true, print: () => {} });
		expect(mkdirMock).toHaveBeenCalled();
		expect(writeMock).toHaveBeenCalled();
		mkdirMock.mockReset();
		writeMock.mockReset();
	});

	it("defaultExec delegates to execFileSync when no exec is injected", async () => {
		const { execFileSync } = await import("node:child_process");
		const mock = vi.mocked(execFileSync);
		mock.mockReturnValue(Buffer.from(""));
		const fs = makeFakeFs();
		runPluginCreate({ ...BASE_INPUT, writeFile: fs.writeFile, print: () => {} });
		expect(mock).toHaveBeenCalledWith("pnpm", ["install", "--frozen-lockfile=false"], { cwd: WORKSPACE_ROOT, stdio: "inherit" });
		mock.mockReset();
	});
});
