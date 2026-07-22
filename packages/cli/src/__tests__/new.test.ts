import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
	execFileSync: vi.fn(),
	spawnSync: vi.fn(() => ({ status: 0, error: undefined })),
}));
vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return { ...actual, existsSync: vi.fn(() => false), mkdirSync: vi.fn(), writeFileSync: vi.fn() };
});

import { NewError, deriveVariants, runNew } from "../commands/new.js";

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

	it("runs pnpm install unless --no-verify", async () => {
		const { exec, calls } = makeExec();
		const { readFile, writeFile, walkFiles } = makeFs({
			"/workspace/my-tool/package.json": { content: JSON.stringify({ name: "@theholocron/cli-template" }) },
		});

		await runNew({ ...BASE, exec, readFile, writeFile, walkFiles, print: () => {} });
		expect(calls.some((c) => c.cmd === "pnpm" && c.args.includes("install"))).toBe(true);
	});

	it("skips pnpm install when noVerify is true", async () => {
		const { exec, calls } = makeExec();
		const { readFile, writeFile, walkFiles } = makeFs({
			"/workspace/my-tool/package.json": { content: JSON.stringify({ name: "@theholocron/cli-template" }) },
		});

		await runNew({ ...BASE, noVerify: true, exec, readFile, writeFile, walkFiles, print: () => {} });
		expect(calls.some((c) => c.cmd === "pnpm" && c.args.includes("install"))).toBe(false);
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
			runNew({ ...BASE, exec: () => {}, readFile: () => "", walkFiles: () => [], print: () => {} }),
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
			}),
		).rejects.toThrow(NewError);
	});
});
