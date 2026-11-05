import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { runDevServe } from "./dev-serve.js";

const run = async (over: Record<string, unknown> = {}, mod: Record<string, unknown> = { handle: () => {} }) => {
	const serveHandler = vi.fn().mockResolvedValue({});
	const importModule = vi.fn().mockResolvedValue(mod);
	await runDevServe({
		cwd: "/app",
		environment: "Dev",
		serve: { handler: "./src/h.ts", export: "handle", required: ["A"], ...over },
		port: 4000,
		importModule,
		serveHandler,
	});
	return { serveHandler, importModule, input: serveHandler.mock.calls[0]![0] };
};

describe("runDevServe", () => {
	it("hands the environment, required variables, logging and port to the server", async () => {
		const logging = { tokenVar: "T", datasetVar: "D" };
		const { input } = await run({ logging });
		expect(input).toMatchObject({ environment: "Dev", required: ["A"], logging, port: 4000 });
	});

	it("imports the handler only when the server asks for it, from the path resolved against the directory", async () => {
		const fn = () => {};
		const { importModule, input } = await run({}, { handle: fn });
		expect(importModule).not.toHaveBeenCalled();
		expect(await input.handler()).toBe(fn);
		expect(importModule).toHaveBeenCalledWith("/app/src/h.ts");
	});

	it("takes the default export when none is named, and requires nothing by default", async () => {
		const fn = () => {};
		const { input } = await run({ export: undefined, required: undefined }, { default: fn });
		expect(input.required).toEqual([]);
		expect(await input.handler()).toBe(fn);
	});

	it("says which export is missing, and where", async () => {
		const { input } = await run({ export: "nope" }, { other: 1 });
		await expect(input.handler()).rejects.toThrow('/app/src/h.ts does not export a function named "nope"');
	});

	it("loads a TypeScript module with tsx when no importer is given", async () => {
		const dir = mkdtempSync(join(tmpdir(), "dev-serve-"));
		try {
			writeFileSync(join(dir, "h.ts"), "export const handle = (n: number): number => n + 1;\n");
			const serveHandler = vi.fn().mockResolvedValue({});
			await runDevServe({
				cwd: dir,
				environment: "E",
				serve: { handler: "./h.ts", export: "handle" },
				port: 0,
				serveHandler,
			});
			const handle = await serveHandler.mock.calls[0]![0].handler();
			expect(handle(1)).toBe(2);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("serves with the real server by default", async () => {
		const real = vi.fn();
		vi.doMock("@theholocron/dagobah", () => ({ serveHandler: real }));
		vi.resetModules();
		const { runDevServe: fresh } = await import("./dev-serve.js");
		await fresh({ cwd: "/app", environment: "E", serve: { handler: "./h.ts" }, port: 1, importModule: vi.fn() });
		expect(real).toHaveBeenCalledTimes(1);
		vi.doUnmock("@theholocron/dagobah");
	});
});
