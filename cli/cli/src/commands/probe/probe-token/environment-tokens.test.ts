import { describe, expect, it, vi } from "vitest";

import type { Vault } from "../../../plugin/index.js";
import { environmentTokens } from "./environment-tokens.js";
import { HoldsNoTokenError } from "./holds-no-token-error.js";

const tokens = [
	{ envName: "HOLOCRON_CLOUDFLARE_TOKEN", vendorEnvName: "CLOUDFLARE_API_TOKEN", keyringKey: "cloudflare" },
];
const gitExec = async () => "git@github.com:theholocron/holocron.git\n";
const vaultOf = (values: Record<string, string>) =>
	({ providerName: "1password", readEnvironment: vi.fn(async () => values) }) as unknown as Vault;
/** A vault with one Environment per name; reading any other throws, as `op` does. */
const vaultByName = (byName: Record<string, Record<string, string>>) =>
	({
		providerName: "1password",
		readEnvironment: vi.fn(async (name: string) => {
			if (!(name in byName)) throw new Error(`no Environment ${name}`);
			return byName[name];
		}),
	}) as unknown as Vault;
const input = (vault: Vault | undefined, over: Partial<Parameters<typeof environmentTokens>[0]> = {}) => ({
	provider: "cloudflare",
	environment: "Sentinel",
	repoRoot: "/r",
	configured: ["Sentinel"],
	gitExec,
	vault,
	tokens,
	...over,
});

describe("environmentTokens", () => {
	it("returns the plugin's own variable, with where it came from", async () => {
		const vault = vaultOf({ HOLOCRON_CLOUDFLARE_TOKEN: "own", CLOUDFLARE_API_TOKEN: "vendor" });
		expect(await environmentTokens(input(vault))).toEqual({
			environment: "Sentinel",
			held: [{ token: "own", variable: "HOLOCRON_CLOUDFLARE_TOKEN", envName: "HOLOCRON_CLOUDFLARE_TOKEN" }],
			missing: [],
			plain: {},
		});
	});

	it("returns every declared token the Environment holds, and names the ones it does not", async () => {
		const several = [
			{ envName: "HOLOCRON_A_TOKEN", keyringKey: "a" },
			{ envName: "HOLOCRON_B_TOKEN", vendorEnvName: "B_TOKEN", keyringKey: "b" },
			{ envName: "HOLOCRON_C_TOKEN", keyringKey: "c" },
		];
		const vault = vaultOf({ HOLOCRON_A_TOKEN: "a", B_TOKEN: "b" });
		expect(await environmentTokens(input(vault, { tokens: several }))).toEqual({
			environment: "Sentinel",
			held: [
				{ token: "a", variable: "HOLOCRON_A_TOKEN", envName: "HOLOCRON_A_TOKEN" },
				{ token: "b", variable: "B_TOKEN", envName: "HOLOCRON_B_TOKEN" },
			],
			missing: ["HOLOCRON_C_TOKEN"],
			plain: {},
		});
	});

	it("looks only for the plugin's own variable when the token has no vendor name", async () => {
		const own = [{ envName: "HOLOCRON_DEMO_TOKEN", keyringKey: "demo" }];
		expect(await environmentTokens(input(vaultOf({ HOLOCRON_DEMO_TOKEN: "own" }), { tokens: own }))).toMatchObject({
			held: [{ token: "own" }],
		});
		await expect(environmentTokens(input(vaultOf({}), { tokens: own }))).rejects.toThrow(
			"Sentinel holds none of HOLOCRON_DEMO_TOKEN"
		);
	});

	it("falls back to the vendor's variable, skipping a blank one", async () => {
		const vault = vaultOf({ HOLOCRON_CLOUDFLARE_TOKEN: "", CLOUDFLARE_API_TOKEN: "vendor" });
		expect(await environmentTokens(input(vault))).toMatchObject({
			held: [{ token: "vendor", variable: "CLOUDFLARE_API_TOKEN", envName: "HOLOCRON_CLOUDFLARE_TOKEN" }],
		});
	});

	it("names the variables it looked for when the Environment holds none, and never a value", async () => {
		const err = await environmentTokens(input(vaultOf({ OTHER: "secret-value" }))).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(HoldsNoTokenError);
		expect((err as Error).message).toBe("Sentinel holds none of HOLOCRON_CLOUDFLARE_TOKEN, CLOUDFLARE_API_TOKEN");
	});

	it("explains a missing vault, a vault that cannot read an Environment and a plugin that lists no token", async () => {
		await expect(environmentTokens(input(undefined))).rejects.toThrow(/needs a vault provider/);
		const noRead = { providerName: "doppler" } as unknown as Vault;
		await expect(environmentTokens(input(noRead))).rejects.toThrow(/needs a vault provider/);
		await expect(environmentTokens(input(vaultOf({}), { tokens: [] }))).rejects.toThrow(/lists no token/);
	});

	describe("only the repo's own Environments", () => {
		it("refuses a name the config does not name, listing the layers and the names it does, and reads nothing", async () => {
			const vault = vaultOf({ HOLOCRON_CLOUDFLARE_TOKEN: "x" });
			const err = await environmentTokens(input(vault, { environment: "Other" })).catch((e: unknown) => e);
			expect((err as Error).message).toBe(
				"Other is not an Environment this repo's config names; use one of: local, dev, ci, prod, preview, Sentinel"
			);
			expect(vault.readEnvironment).not.toHaveBeenCalled();
		});

		it("takes a layer word as this repo's own Environment, whether or not the config names it", async () => {
			const vault = vaultByName({ "theholocron/holocron - ci": { HOLOCRON_CLOUDFLARE_TOKEN: "ci-token" } });
			expect(await environmentTokens(input(vault, { environment: "ci", configured: [] }))).toMatchObject({
				environment: "theholocron/holocron - ci",
				held: [{ token: "ci-token", variable: "HOLOCRON_CLOUDFLARE_TOKEN" }],
			});
		});

		it("reads local over dev, as the CLI does, so a variable only dev holds still comes through", async () => {
			const vault = vaultByName({
				"theholocron/holocron - dev": { HOLOCRON_CLOUDFLARE_TOKEN: "dev-token" },
				"theholocron/holocron - local": { OTHER: "x" },
			});
			expect(await environmentTokens(input(vault, { environment: "local", configured: [] }))).toMatchObject({
				environment: "theholocron/holocron - local",
				held: [{ token: "dev-token" }],
			});
			const overridden = vaultByName({
				"theholocron/holocron - dev": { HOLOCRON_CLOUDFLARE_TOKEN: "dev-token" },
				"theholocron/holocron - local": { HOLOCRON_CLOUDFLARE_TOKEN: "local-token" },
			});
			expect(await environmentTokens(input(overridden, { environment: "local", configured: [] }))).toMatchObject({
				held: [{ token: "local-token" }],
			});
		});

		it("returns the visible values as `plain`, never a concealed one or a declared token", async () => {
			const vault = {
				providerName: "1password",
				readEnvironment: vi.fn(),
				readEnvironmentEntries: vi.fn(async () => [
					{ name: "HOLOCRON_CLOUDFLARE_TOKEN", value: "tok", concealed: true },
					{ name: "CLOUDFLARE_API_TOKEN", value: "visible-token", concealed: false },
					{ name: "HOLOCRON_AXIOM_DATASET", value: "logs", concealed: false },
					{ name: "SOME_SECRET", value: "s3", concealed: true },
				]),
			} as unknown as Vault;
			const found = await environmentTokens(input(vault));
			expect(found.plain).toEqual({ HOLOCRON_AXIOM_DATASET: "logs" });
			expect(found.held).toEqual([
				{ token: "tok", variable: "HOLOCRON_CLOUDFLARE_TOKEN", envName: "HOLOCRON_CLOUDFLARE_TOKEN" },
			]);
		});

		it("merges the plain values of local over dev, and gives none when the vault cannot tell", async () => {
			const entries = (rows: Record<string, string>) =>
				Object.entries(rows).map(([name, value]) => ({ name, value, concealed: false }));
			const byName: Record<string, Array<{ name: string; value: string; concealed: boolean }>> = {
				"theholocron/holocron - dev": entries({ HOLOCRON_CLOUDFLARE_TOKEN: "t", A: "dev", B: "dev" }),
				"theholocron/holocron - local": entries({ B: "local" }),
			};
			const vault = {
				providerName: "1password",
				readEnvironment: vi.fn(),
				readEnvironmentEntries: vi.fn(async (name: string) => {
					if (!byName[name]) throw new Error("absent");
					return byName[name];
				}),
			} as unknown as Vault;
			const found = await environmentTokens(input(vault, { environment: "local", configured: [] }));
			expect(found.plain).toEqual({ A: "dev", B: "local" });
			const blind = await environmentTokens(input(vaultOf({ HOLOCRON_CLOUDFLARE_TOKEN: "t", A: "x" })));
			expect(blind.plain).toEqual({});
		});

		it("lets the local Environment be absent, but not the dev one it falls back to", async () => {
			const onlyDev = vaultByName({ "theholocron/holocron - dev": { HOLOCRON_CLOUDFLARE_TOKEN: "dev-token" } });
			expect(await environmentTokens(input(onlyDev, { environment: "local", configured: [] }))).toMatchObject({
				held: [{ token: "dev-token" }],
			});
			const neither = vaultByName({});
			await expect(environmentTokens(input(neither, { environment: "local", configured: [] }))).rejects.toThrow(
				/no Environment theholocron\/holocron - dev/
			);
		});
	});
});
