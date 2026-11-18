import { describe, expect, it, vi } from "vitest";

import type { Vault } from "../../../plugin/index.js";
import { readEntryValues } from "./read-entry-values.js";

const gitExec = async () => "git@github.com:acme/app.git\n";
const entry = (name: string, value: string) => ({ name, value, concealed: true });
/** A vault with one Environment per name; reading any other throws, as `op` does. */
const vaultByName = (byName: Record<string, ReturnType<typeof entry>[]>) =>
	({
		providerName: "1password",
		readEnvironmentEntries: vi.fn(async (name: string) => {
			if (!(name in byName)) throw new Error(`no Environment ${name}`);
			return byName[name];
		}),
	}) as unknown as Vault;
const input = (vault: Vault, over: Partial<Parameters<typeof readEntryValues>[0]> = {}) => ({
	vault,
	environment: "dev",
	configured: [],
	repoRoot: "/r",
	names: ["A_SECRET"],
	gitExec,
	...over,
});

describe("readEntryValues", () => {
	it("takes only the named entries of the layer's Environment, and drops every other one", async () => {
		const vault = vaultByName({ "acme/app - dev": [entry("A_SECRET", "s3"), entry("OTHER", "nope")] });
		const result = await readEntryValues(input(vault));
		expect(result.environmentId).toBe("acme/app - dev");
		expect([...result.values]).toEqual([["A_SECRET", "s3"]]);
		expect(result.missing).toEqual([]);
	});

	it("reports a name the Environment lacks, or holds blank, as missing", async () => {
		const vault = vaultByName({ "acme/app - dev": [entry("BLANK", "")] });
		const result = await readEntryValues(input(vault, { names: ["A_SECRET", "BLANK"] }));
		expect(result.values.size).toBe(0);
		expect(result.missing).toEqual(["A_SECRET", "BLANK"]);
	});

	it("reads `local` over `dev`, and `- local` may be absent", async () => {
		const both = vaultByName({
			"acme/app - dev": [entry("A_SECRET", "from-dev"), entry("B_SECRET", "dev-b")],
			"acme/app - local": [entry("A_SECRET", "from-local")],
		});
		const merged = await readEntryValues(input(both, { environment: "local", names: ["A_SECRET", "B_SECRET"] }));
		expect([...merged.values]).toEqual([
			["A_SECRET", "from-local"],
			["B_SECRET", "dev-b"],
		]);
		const devOnly = vaultByName({ "acme/app - dev": [entry("A_SECRET", "from-dev")] });
		const fallback = await readEntryValues(input(devOnly, { environment: "local" }));
		expect(fallback.values.get("A_SECRET")).toBe("from-dev");
	});

	it("reads a named Environment the config names, as it is", async () => {
		const vault = vaultByName({ Sentinel: [entry("A_SECRET", "x")] });
		const result = await readEntryValues(input(vault, { environment: "Sentinel", configured: ["Sentinel"] }));
		expect(result.environmentId).toBe("Sentinel");
		expect(result.values.get("A_SECRET")).toBe("x");
	});

	it("refuses an Environment the config does not name", async () => {
		const vault = vaultByName({});
		const err = await readEntryValues(input(vault, { environment: "Elsewhere", configured: ["Sentinel"] })).catch(
			(e: unknown) => e
		);
		expect((err as Error).message).toMatch(
			/not an Environment this repo's config names; use one of: local, dev, ci, prod, Sentinel/
		);
		expect(vault.readEnvironmentEntries).not.toHaveBeenCalled();
	});
});
