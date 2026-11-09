import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { textImportLoad } from "./text-import-load.js";

describe("textImportLoad", () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "text-import-load-"));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("loads a .md file as a module exporting its text", () => {
		const file = join(dir, "org.md");
		writeFileSync(file, "# Org\n\nrules `here`\n");
		const nextLoad = vi.fn();

		const result = textImportLoad(
			pathToFileURL(file).href,
			{ format: undefined, conditions: [], importAttributes: {} },
			nextLoad
		);

		expect(nextLoad).not.toHaveBeenCalled();
		expect(result).toMatchObject({ format: "module", shortCircuit: true });
		expect(result.source).toBe(`export default ${JSON.stringify("# Org\n\nrules `here`\n")};`);
	});

	it("leaves other files to the next loader", () => {
		const file = join(dir, "thing.ts");
		writeFileSync(file, "export {};\n");
		const next = { format: "module" as const, source: "x" };
		const nextLoad = vi.fn().mockReturnValue(next);
		const context = { format: undefined, conditions: [], importAttributes: {} };

		const result = textImportLoad(pathToFileURL(file).href, context, nextLoad);

		expect(nextLoad).toHaveBeenCalledWith(pathToFileURL(file).href, context);
		expect(result).toBe(next);
	});

	it("leaves a url that is not a file to the next loader", () => {
		const next = { format: "builtin" as const, source: null };
		const nextLoad = vi.fn().mockReturnValue(next);

		const result = textImportLoad("node:fs", { format: undefined, conditions: [], importAttributes: {} }, nextLoad);

		expect(result).toBe(next);
	});
});
