import { describe, expect, it } from "vitest";

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

// Point the CWD at the real workspace root so the preflight passes.
const WORKSPACE_ROOT = "/Users/archives/Code/theholocron/holocron";

const BASE_INPUT = {
	slug: "nonexistent-fake-slug",
	vendorName: "FakeVendor",
	capability: "tooling" as const,
	vendorEnv: "FAKEVENDOR_KEY",
	baseUrl: "https://api.fakevendor.example",
	cwd: WORKSPACE_ROOT,
};

describe("runPluginCreate — orchestrator", () => {
	it("emits exactly 17 files (5 config + 1 readme + 5 source + 6 tests)", () => {
		const fs = makeFakeFs();
		const report = runPluginCreate({
			...BASE_INPUT,
			writeFile: fs.writeFile,
			print: () => {},
		});
		expect(report.status).toBe("ok");
		expect(report.filesWritten).toHaveLength(17);
		expect(fs.size()).toBe(17);
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
		expect(report.filesWritten).toHaveLength(17);
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
		expect(content).toMatch(/getKeyringToken/);
		expect(content).toMatch(/keyring\("acme"\)/);
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
