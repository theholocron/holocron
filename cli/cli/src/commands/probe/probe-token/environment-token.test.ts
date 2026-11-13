import { describe, expect, it, vi } from "vitest";

import type { Vault } from "../../../plugin/index.js";
import { environmentToken } from "./environment-token.js";

const tokens = [
	{ envName: "HOLOCRON_CLOUDFLARE_TOKEN", vendorEnvName: "CLOUDFLARE_API_TOKEN", keyringKey: "cloudflare" },
];
const vaultOf = (values: Record<string, string>) =>
	({ providerName: "1password", readEnvironment: vi.fn(async () => values) }) as unknown as Vault;
const input = (vault: Vault | undefined, over: Partial<Parameters<typeof environmentToken>[0]> = {}) => ({
	provider: "cloudflare",
	environment: "Sentinel",
	repoRoot: "/r",
	vault,
	tokens,
	...over,
});

describe("environmentToken", () => {
	it("returns the plugin's own variable, with where it came from", async () => {
		const vault = vaultOf({ HOLOCRON_CLOUDFLARE_TOKEN: "own", CLOUDFLARE_API_TOKEN: "vendor" });
		expect(await environmentToken(input(vault))).toEqual({
			token: "own",
			environment: "Sentinel",
			variable: "HOLOCRON_CLOUDFLARE_TOKEN",
		});
	});

	it("falls back to the vendor's variable, skipping a blank one", async () => {
		const vault = vaultOf({ HOLOCRON_CLOUDFLARE_TOKEN: "", CLOUDFLARE_API_TOKEN: "vendor" });
		expect(await environmentToken(input(vault))).toMatchObject({
			token: "vendor",
			variable: "CLOUDFLARE_API_TOKEN",
		});
	});

	it("names the variables it looked for when the Environment holds none, and never a value", async () => {
		const err = await environmentToken(input(vaultOf({ OTHER: "secret-value" }))).catch((e: unknown) => e);
		expect((err as Error).message).toBe("Sentinel holds none of HOLOCRON_CLOUDFLARE_TOKEN, CLOUDFLARE_API_TOKEN");
	});

	it("explains a missing vault, a vault that cannot read an Environment and a plugin that lists no token", async () => {
		await expect(environmentToken(input(undefined))).rejects.toThrow(/needs a vault provider/);
		const noRead = { providerName: "doppler" } as unknown as Vault;
		await expect(environmentToken(input(noRead))).rejects.toThrow(/needs a vault provider/);
		await expect(environmentToken(input(vaultOf({}), { tokens: [] }))).rejects.toThrow(/lists no token/);
	});
});
