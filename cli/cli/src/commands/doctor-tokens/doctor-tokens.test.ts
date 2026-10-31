import { stripVTControlCharacters } from "node:util";

import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import type { AuthImporter, AuthPluginModule } from "../auth/index.js";
import { runDoctorTokens } from "./doctor-tokens.js";

type Raw = Parameters<typeof resolveConfig>[0];

const loaded = (providers: Record<string, unknown>): LoadedConfig => ({
	resolved: resolveConfig({ name: "demo", providers } as Raw),
	filepath: "/tmp/test/holocron.config.json",
});

const GITHUB = "@theholocron/holocron-plugin-github";
const ADMIN = { envName: "HOLOCRON_ADMIN_TOKEN", keyringKey: "github.admin" };
const READ = { envName: "HOLOCRON_READ_TOKEN", keyringKey: "github.read" };

const importerOf =
	(modules: Record<string, AuthPluginModule | Error>): AuthImporter =>
	async (pkg) => {
		const found = modules[pkg];
		if (!found) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
		if (found instanceof Error) throw found;
		return found;
	};

async function run(
	config: LoadedConfig,
	modules: Record<string, AuthPluginModule | Error>,
	opts: { env?: NodeJS.ProcessEnv; keyring?: Record<string, string>; now?: Date } = {}
) {
	const lines: string[] = [];
	const report = await runDoctorTokens({
		loaded: config,
		context: { repoRoot: "/tmp/test" },
		importer: importerOf(modules),
		env: opts.env ?? {},
		now: () => opts.now ?? NOW,
		keyring: (key) => opts.keyring?.[key] ?? null,
		print: (l) => lines.push(stripVTControlCharacters(l)),
		logger: fakeLogger(),
	});
	return { report, lines };
}

const github = { source: "github" };
const NOW = new Date("2026-11-01T00:00:00Z");
const expiringIn = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString();

describe("doctor tokens", () => {
	it("verifies a token found in the environment, and says where it came from and whose it is", async () => {
		const verifyToken = vi.fn(async () => ({ ok: true as const, subject: "user @ cnewton" }));
		const { report, lines } = await run(
			loaded(github),
			{ [GITHUB]: { tokens: [ADMIN], verifyToken } },
			{ env: { HOLOCRON_ADMIN_TOKEN: "ghp_secret" } }
		);
		expect(verifyToken).toHaveBeenCalledWith("ghp_secret");
		expect(report.status).toBe("ok");
		expect(report.rows).toEqual([
			{
				id: "github.admin",
				title: "github.admin",
				status: "ok",
				detail: "user @ cnewton (HOLOCRON_ADMIN_TOKEN)",
				problems: [],
			},
		]);
		expect(lines.at(-1)).toBe("1 ok, 0 fail, 0 skipped");
	});

	it("falls back to the keyring when the environment has none, preferring the environment when both are set", async () => {
		const verifyToken = vi.fn(async (_token: string) => ({ ok: true as const, subject: "user @ a" }));
		const modules = { [GITHUB]: { tokens: [ADMIN, READ], verifyToken } };
		const { report } = await run(loaded(github), modules, {
			env: { HOLOCRON_READ_TOKEN: "from-env" },
			keyring: { "github.admin": "from-keyring", "github.read": "from-keyring-too" },
		});
		expect(verifyToken.mock.calls.map((c) => c[0])).toEqual(["from-keyring", "from-env"]);
		expect(report.rows.map((r) => r.detail)).toEqual(["user @ a (keyring)", "user @ a (HOLOCRON_READ_TOKEN)"]);
	});

	it("reads the plugin's variable, then the vendor's, then the keyring, as the plugins do", async () => {
		const verifyToken = vi.fn(async (_token: string) => ({ ok: true as const, subject: "me" }));
		const token = { envName: "HOLOCRON_VERCEL_TOKEN", vendorEnvName: "VERCEL_TOKEN", keyringKey: "vercel" };
		const modules = { "@theholocron/holocron-plugin-vercel": { tokens: [token], verifyToken } };
		const config = loaded({ deployment: "vercel" });
		const keyring = { vercel: "kr" };

		const both = await run(config, modules, {
			env: { HOLOCRON_VERCEL_TOKEN: "own", VERCEL_TOKEN: "vendor" },
			keyring,
		});
		const vendor = await run(config, modules, { env: { VERCEL_TOKEN: "vendor" }, keyring });
		const ring = await run(config, modules, { keyring });

		expect(verifyToken.mock.calls.map((c) => c[0])).toEqual(["own", "vendor", "kr"]);
		expect([both, vendor, ring].map((r) => r.report.rows[0]!.detail)).toEqual([
			"me (HOLOCRON_VERCEL_TOKEN)",
			"me (VERCEL_TOKEN)",
			"me (keyring)",
		]);
	});

	it("names both variables when a token with a vendor variable is not set", async () => {
		const token = { envName: "HOLOCRON_VERCEL_TOKEN", vendorEnvName: "VERCEL_TOKEN", keyringKey: "vercel" };
		const { report } = await run(loaded({ deployment: "vercel" }), {
			"@theholocron/holocron-plugin-vercel": { tokens: [token] },
		});
		expect(report.rows[0]!.detail).toBe(
			"not set (HOLOCRON_VERCEL_TOKEN / VERCEL_TOKEN, or `holocron auth set vercel`)"
		);
	});

	it("does not hand a token to verifyToken when the plugin says that check is for a different credential", async () => {
		const verifyToken = vi.fn(async () => ({ ok: true as const, subject: "x" }));
		const token = { envName: "HOLOCRON_DISCORD_BOT_TOKEN", keyringKey: "discord.holonet", verifiable: false };
		const { report } = await run(
			loaded({ notifications: ["discord"] }),
			{ "@theholocron/holocron-plugin-discord": { tokens: [token], verifyToken } },
			{ env: { HOLOCRON_DISCORD_BOT_TOKEN: "bot" } }
		);
		expect(verifyToken).not.toHaveBeenCalled();
		expect(report.rows[0]).toMatchObject({ status: "skip", detail: "set, but its plugin cannot verify it" });
	});

	it("fails a rejected token with the provider's message and keeps checking the rest", async () => {
		const verifyToken = vi.fn(async (token: string) =>
			token === "old"
				? { ok: false as const, message: "Bad credentials" }
				: { ok: true as const, subject: "user @ a" }
		);
		const { report } = await run(
			loaded(github),
			{ [GITHUB]: { tokens: [ADMIN, READ], verifyToken } },
			{ keyring: { "github.admin": "old", "github.read": "new" } }
		);
		expect(report.status).toBe("fail");
		expect(report.rows.map((r) => [r.status, r.detail])).toEqual([
			["fail", "rejected (keyring): Bad credentials"],
			["ok", "user @ a (keyring)"],
		]);
	});

	it("fails a token whose verification throws", async () => {
		const { report } = await run(
			loaded(github),
			{
				[GITHUB]: {
					tokens: [ADMIN],
					verifyToken: async () => {
						throw new Error("socket hang up");
					},
				},
			},
			{ keyring: { "github.admin": "t" } }
		);
		expect(report.rows[0]).toMatchObject({
			status: "fail",
			detail: "could not be verified (keyring): socket hang up",
		});
	});

	it("skips a token that is not set, naming where to set it, and does not fail the run", async () => {
		const { report } = await run(loaded(github), {
			[GITHUB]: { tokens: [ADMIN], verifyToken: async () => ({ ok: true, subject: "x" }) },
		});
		expect(report.status).toBe("skip");
		expect(report.rows[0]).toMatchObject({
			status: "skip",
			detail: "not set (HOLOCRON_ADMIN_TOKEN, or `holocron auth set github.admin`)",
		});
		expect(report.reason).toBe("not set (HOLOCRON_ADMIN_TOKEN, or `holocron auth set github.admin`)");
	});

	it("skips a token whose plugin cannot verify it, without calling anything", async () => {
		const { report } = await run(
			loaded(github),
			{ [GITHUB]: { tokens: [ADMIN] } },
			{ env: { HOLOCRON_ADMIN_TOKEN: "t" } }
		);
		expect(report.rows[0]).toMatchObject({ status: "skip", detail: "set, but its plugin cannot verify it" });
	});

	it("skips a plugin that cannot be loaded, with the reason, and a plugin that lists no tokens adds nothing", async () => {
		const { report } = await run(loaded({ source: "github", vault: "doppler" }), {
			"@theholocron/holocron-plugin-doppler": { verifyToken: async () => ({ ok: true, subject: "x" }) },
		});
		expect(report.rows.map((r) => [r.id, r.status])).toEqual([[GITHUB, "skip"]]);
		expect(report.rows[0]!.detail).toMatch(/^cannot load the plugin: MODULE_NOT_FOUND/);
	});

	it("looks at each package once, however many capabilities it serves", async () => {
		const importer = vi.fn(importerOf({ [GITHUB]: { tokens: [] } }));
		await runDoctorTokens({
			loaded: loaded({ source: "github", ci: "github", secrets: "github", notifications: ["github"] }),
			context: { repoRoot: "/tmp/test" },
			importer,
			env: {},
			keyring: () => null,
			print: () => {},
			logger: fakeLogger(),
		});
		expect(importer).toHaveBeenCalledTimes(1);
	});

	it("says no plugin lists tokens when none does", async () => {
		const { report, lines } = await run(loaded({ source: "github" }), { [GITHUB]: {} });
		expect(report.rows).toEqual([
			{
				id: "tokens",
				title: "tokens",
				status: "skip",
				detail: "no configured plugin lists the tokens it takes",
				problems: [],
			},
		]);
		expect(lines.at(-1)).toBe("0 ok, 0 fail, 1 skipped");
	});

	it("never prints a token", async () => {
		const { lines } = await run(
			loaded(github),
			{ [GITHUB]: { tokens: [ADMIN], verifyToken: async () => ({ ok: false, message: "Bad credentials" }) } },
			{ env: { HOLOCRON_ADMIN_TOKEN: "ghp_topsecret" } }
		);
		expect(lines.join("\n")).not.toContain("ghp_topsecret");
	});

	it("uses the process environment, the OS keyring and the console by default", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const report = await runDoctorTokens({
			loaded: loaded({ notifications: ["@theholocron/does-not-exist-plugin"] }),
			context: { repoRoot: "/tmp/test" },
			// No importer: the real one cannot find a plugin that does not exist.
		});
		log.mockRestore();
		expect(report.rows[0]).toMatchObject({ status: "skip" });
		expect(report.rows[0]!.detail).toMatch(/^cannot load the plugin/);
	});

	it("shows how long a token has left when it expires later than the warning window", async () => {
		const verifyToken = async () => ({ ok: true as const, subject: "user @ a", expiresAt: expiringIn(12) });
		const { report } = await run(
			loaded(github),
			{ [GITHUB]: { tokens: [ADMIN], verifyToken } },
			{ env: { HOLOCRON_ADMIN_TOKEN: "t" } }
		);
		expect(report.status).toBe("ok");
		expect(report.rows[0]).toMatchObject({
			status: "ok",
			detail: "user @ a (HOLOCRON_ADMIN_TOKEN), expires in 12 days",
			problems: [],
		});
	});

	it("fails a token that expires within a week, with a problem line", async () => {
		const verifyToken = async () => ({ ok: true as const, subject: "user @ a", expiresAt: expiringIn(3) });
		const { report, lines } = await run(
			loaded(github),
			{ [GITHUB]: { tokens: [ADMIN], verifyToken } },
			{ env: { HOLOCRON_ADMIN_TOKEN: "t" } }
		);
		expect(report.status).toBe("fail");
		expect(report.rows[0]).toMatchObject({
			status: "fail",
			detail: "user @ a (HOLOCRON_ADMIN_TOKEN), expires in 3 days",
			problems: ["expires in 3 days: renew it"],
		});
		expect(lines).toContain("      - expires in 3 days: renew it");
	});

	it("shows nothing extra when the expiry cannot be read", async () => {
		const verifyToken = async () => ({ ok: true as const, subject: "user @ a", expiresAt: "later" });
		const { report } = await run(
			loaded(github),
			{ [GITHUB]: { tokens: [ADMIN], verifyToken } },
			{ env: { HOLOCRON_ADMIN_TOKEN: "t" } }
		);
		expect(report.rows[0]?.detail).toBe("user @ a (HOLOCRON_ADMIN_TOKEN)");
	});

	it("uses the clock when no time is injected", async () => {
		const lines: string[] = [];
		const soon = new Date(Date.now() + 86_400_000).toISOString();
		const report = await runDoctorTokens({
			loaded: loaded(github),
			context: { repoRoot: "/tmp/test" },
			importer: importerOf({
				[GITHUB]: { tokens: [ADMIN], verifyToken: async () => ({ ok: true, subject: "u", expiresAt: soon }) },
			}),
			env: { HOLOCRON_ADMIN_TOKEN: "t" },
			print: (l) => lines.push(l),
			logger: fakeLogger(),
		});
		expect(report.status).toBe("fail");
	});
});
