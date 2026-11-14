import { stripVTControlCharacters } from "node:util";

import { describe, expect, it, vi } from "vitest";

const inquirerConfirm = vi.hoisted(() => vi.fn());
vi.mock("@inquirer/prompts", () => ({ confirm: inquirerConfirm }));

import { NonInteractiveError } from "@theholocron/kyber/ui";

import type { Tooling, ToolingExportInput, ToolingExportResult } from "../../../plugin/index.js";
import { fakeLoader, loadedWith } from "../../migrate/migrate.testing.js";
import { runRequestsExport } from "./run-requests-export.js";
import type { RunRequestsExportInput } from "./run-requests-export.type.js";

const OPTIONS = { collectionFiles: ["requests/collection.json"], envFiles: ["requests/environment.json"] };

const tool = (name: string, exp?: Tooling["export"]): Tooling =>
	({
		key: "tooling",
		providerName: name,
		sync: vi.fn(),
		doctor: vi.fn(),
		...(exp ? { export: exp } : {}),
	}) as Tooling;

const result = (over: Partial<ToolingExportResult> = {}): ToolingExportResult => ({
	files: ["collection.yml"],
	issues: [],
	...over,
});

async function run(
	tools: Tooling[],
	providers: Array<[string, Record<string, unknown>]> = tools.map((t) => [t.providerName, OPTIONS]),
	over: Partial<RunRequestsExportInput> = {}
) {
	const lines: string[] = [];
	const report = await runRequestsExport({
		loaded: loadedWith({ tooling: providers }),
		context: { repoRoot: "/repo" },
		yes: true,
		loader: fakeLoader({ tooling: tools }),
		print: (l) => lines.push(stripVTControlCharacters(l)),
		...over,
	});
	return { report, text: lines.join("\n") };
}

describe("runRequestsExport", () => {
	it("calls export with the files, the default folder and the repo root", async () => {
		const exp = vi.fn(async (_input: ToolingExportInput) => result({ files: ["a.yml", "b.yml"] }));
		const { report, text } = await run([tool("bruno", exp)]);
		expect(exp).toHaveBeenCalledWith({
			collectionFiles: ["requests/collection.json"],
			envFiles: ["requests/environment.json"],
			outDir: "/repo/requests/.export/bruno",
			repoRoot: "/repo",
		});
		expect(report.status).toBe("ok");
		expect(text).toContain("wrote 2 file(s) to requests/.export/bruno (a.yml, b.yml)");
		expect(text).toContain("1 ok, 0 fail, 0 skipped");
	});

	it("lists a conversion issue under the row without failing the run", async () => {
		const exp = vi.fn(async () =>
			result({ issues: [{ file: "requests/collection.json", message: "lost a script" }] })
		);
		const { report, text } = await run([tool("bruno", exp)]);
		expect(report.status).toBe("ok");
		expect(text).toContain("issue in requests/collection.json: lost a script");
	});

	it("lists no files when none were written", async () => {
		const { text } = await run([tool("bruno", async () => result({ files: [] }))]);
		expect(text).toContain("wrote 0 file(s) to requests/.export/bruno\n");
	});

	it("puts every provider under --out", async () => {
		const bruno = vi.fn(async (_input: ToolingExportInput) => result());
		const postman = vi.fn(async (_input: ToolingExportInput) => result());
		await run([tool("bruno", bruno), tool("postman", postman)], undefined, { out: "build" });
		expect(bruno.mock.calls[0]![0].outDir).toBe("/repo/build/bruno");
		expect(postman.mock.calls[0]![0].outDir).toBe("/repo/build/postman");
	});

	it("exports only for --to", async () => {
		const bruno = vi.fn(async (_input: ToolingExportInput) => result());
		const postman = vi.fn(async (_input: ToolingExportInput) => result());
		await run([tool("bruno", bruno), tool("postman", postman)], undefined, { to: "bruno" });
		expect(bruno).toHaveBeenCalledTimes(1);
		expect(postman).not.toHaveBeenCalled();
	});

	it("fails for a --to that is not a tooling provider of the config", async () => {
		const { report, text } = await run([tool("bruno", vi.fn())], undefined, { to: "insomnia" });
		expect(report.status).toBe("fail");
		expect(text).toContain("not a `tooling` provider of this config (bruno)");
	});

	it("fails when the config has no tooling provider", async () => {
		const { report, text } = await run([], []);
		expect(report.status).toBe("fail");
		expect(text).toContain("no `tooling` provider");
	});

	it("fails when the config names no providers at all", async () => {
		const report = await runRequestsExport({
			loaded: loadedWith(),
			context: { repoRoot: "/repo" },
			print: () => undefined,
		});
		expect(report.status).toBe("fail");
	});

	it("reads a single tooling entry as one provider", async () => {
		const exp = vi.fn(async (_input: ToolingExportInput) => result());
		const lines: string[] = [];
		const report = await runRequestsExport({
			loaded: loadedWith({ tooling: ["bruno", OPTIONS] }),
			context: { repoRoot: "/repo" },
			yes: true,
			loader: fakeLoader({ tooling: [tool("bruno", exp)] }),
			print: (l) => lines.push(l),
		});
		expect(report.status).toBe("ok");
		expect(exp).toHaveBeenCalledTimes(1);
	});

	it("skips a provider with no export, and one with no collection files", async () => {
		const { report, text } = await run(
			[tool("plain"), tool("bare", vi.fn())],
			[
				["plain", OPTIONS],
				["bare", { collectionFiles: "nope", envFiles: [1] }],
			]
		);
		expect(report.status).toBe("ok");
		expect(text).toContain("has no export");
		expect(text).toContain("names no `collectionFiles`");
		expect(text).toContain("0 ok, 0 fail, 2 skipped");
	});

	it("exports a collection with no environment file", async () => {
		const exp = vi.fn(async (_input: ToolingExportInput) => result());
		await run([tool("bruno", exp)], [["bruno", { collectionFiles: ["requests/collection.json"] }]]);
		expect(exp.mock.calls[0]![0].envFiles).toEqual([]);
	});

	it("fails a provider that did not load, naming why", async () => {
		const loader = {
			...fakeLoader({}),
			loadFailures: () => [{ key: "tooling", provider: "bruno", error: new Error("boom") }],
		} as never;
		const { report, text } = await run([], [["bruno", OPTIONS]], { loader });
		expect(report.status).toBe("fail");
		expect(text).toContain("the provider is not available (boom)");
	});

	it("fails a provider that did not load, with no reason known", async () => {
		const { text } = await run([], [["bruno", OPTIONS]]);
		expect(text).toContain("the provider is not available\n");
	});

	it("fails for a folder that would write over the source", async () => {
		const exp = vi.fn(async (_input: ToolingExportInput) => result());
		const { report, text } = await run([tool("requests", exp)], undefined, { out: "requests/.." });
		expect(report.status).toBe("fail");
		expect(text).toContain("never writes there");
		expect(exp).not.toHaveBeenCalled();
	});

	it("fails the provider whose export throws, and goes on with the next", async () => {
		const good = vi.fn(async (_input: ToolingExportInput) => result());
		const { report, text } = await run([
			tool("bruno", async () => {
				throw new Error("cannot read");
			}),
			tool("postman", good),
		]);
		expect(report.status).toBe("fail");
		expect(text).toContain("cannot read");
		expect(good).toHaveBeenCalledTimes(1);
	});

	it("converts but writes nothing on --dry-run, and does not ask", async () => {
		const exp = vi.fn(async (_input: ToolingExportInput) => result());
		const { text } = await run([tool("bruno", exp)], undefined, {
			context: { repoRoot: "/repo", dryRun: true },
			yes: undefined,
			interactive: false,
		});
		expect(exp.mock.calls[0]![0].dryRun).toBe(true);
		expect(text).toContain("(dry-run)");
		expect(text).toContain("would write 1 file(s)");
	});

	it("refuses to write without --yes and without a terminal", async () => {
		const exp = vi.fn(async (_input: ToolingExportInput) => result());
		const err = await run([tool("bruno", exp)], undefined, { yes: undefined, interactive: false }).catch(
			(e: unknown) => e
		);
		expect(err).toBeInstanceOf(NonInteractiveError);
		expect(exp).not.toHaveBeenCalled();
	});

	it("asks first on a terminal, and writes nothing when the answer is no", async () => {
		const exp = vi.fn(async (_input: ToolingExportInput) => result());
		const confirm = vi.fn(async () => false);
		const { report } = await run([tool("bruno", exp)], undefined, { yes: undefined, interactive: true, confirm });
		expect(confirm).toHaveBeenCalledWith("Write the exports for bruno?");
		expect(report).toEqual({ status: "cancelled", rows: [] });
		expect(exp).not.toHaveBeenCalled();
	});

	it("writes when the answer is yes", async () => {
		const exp = vi.fn(async (_input: ToolingExportInput) => result());
		const { report } = await run([tool("bruno", exp)], undefined, {
			yes: undefined,
			interactive: true,
			confirm: async () => true,
		});
		expect(report.status).toBe("ok");
		expect(exp).toHaveBeenCalledTimes(1);
	});

	it("asks through inquirer by default", async () => {
		inquirerConfirm.mockResolvedValueOnce(true);
		const exp = vi.fn(async (_input: ToolingExportInput) => result());
		await run([tool("bruno", exp)], undefined, { yes: undefined, interactive: true });
		expect(inquirerConfirm).toHaveBeenCalledWith({ message: "Write the exports for bruno?", default: false });
		expect(exp).toHaveBeenCalledTimes(1);
	});

	it("reads stdin for a terminal when not told", async () => {
		const exp = vi.fn(async (_input: ToolingExportInput) => result());
		const err = await run([tool("bruno", exp)], undefined, { yes: undefined }).catch((e: unknown) => e);
		// Under test stdin is not a terminal.
		expect(err).toBeInstanceOf(NonInteractiveError);
	});
});
