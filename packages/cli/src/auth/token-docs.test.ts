import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const page = readFileSync(join(root, "docs/src/content/docs/tokens.mdx"), "utf8");

/** Every `key: "value"` string a source file declares for one of the token resolver settings. */
function declared(file: string, key: "envName" | "vendorEnvName" | "keyringService" | "keyringKey"): string[] {
	const text = readFileSync(file, "utf8");
	return [...text.matchAll(new RegExp(`\\b${key}:\\s*"([^"]+)"`, "g"))].map((m) => m[1]!);
}

const authFiles = readdirSync(join(root, "plugins"))
	.map((dir) => join(root, "plugins", dir, "src/auth.ts"))
	.filter((file) => {
		try {
			readFileSync(file);
			return true;
		} catch {
			return false;
		}
	});

describe("the token reference", () => {
	it("found the plugins' resolvers to check", () => {
		expect(authFiles.length).toBeGreaterThan(10);
	});

	// A resolver nobody documented is a token nobody knows to set, or knows is read from the environment.
	for (const file of authFiles) {
		const plugin = file.split("/").at(-3)!;
		it(`documents every token ${plugin} resolves`, () => {
			const names = [
				...declared(file, "envName"),
				...declared(file, "vendorEnvName"),
				...declared(file, "keyringService"),
				...declared(file, "keyringKey"),
			];
			const missing = names.filter((name) => !page.includes(`\`${name}\``));
			expect(missing, `not in docs/src/content/docs/tokens.mdx: ${missing.join(", ")}`).toEqual([]);
		});
	}

	it("documents the one resolver the setup command builds itself", () => {
		const setup = join(root, "packages/cli/src/commands/setup/run-setup.ts");
		const names = [...declared(setup, "envName"), ...declared(setup, "keyringKey")];
		expect(names.filter((name) => !page.includes(`\`${name}\``))).toEqual([]);
	});
});
