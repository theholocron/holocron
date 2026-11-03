import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

// The real keychain and the real clipboard are things a test must never touch.
const write = vi.hoisted(() => vi.fn(async (_text: string) => {}));
vi.mock("clipboardy", () => ({ default: { write } }));
vi.mock("../../auth/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../auth/index.js")>()),
	getToken: () => null,
	isKeyringAvailable: () => true,
}));

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { WorkspaceContextError } from "../../plugin/index.js";
import type { AuthImporter } from "../auth/index.js";
import { runAuthExport } from "./auth-export.js";

const loaded: LoadedConfig = {
	resolved: resolveConfig({ name: "demo", providers: { source: "github", errors: "sentry" } }),
	filepath: "/tmp/test/holocron.config.json",
};

type Listed = { envName: string; vendorEnvName?: string; keyringKey: string };
const TOKENS: Record<string, { tokens?: Listed[] }> = {
	"@theholocron/holocron-plugin-github": {
		tokens: [
			{ envName: "HOLOCRON_ORG_TOKEN", keyringKey: "github.org" },
			{ envName: "HOLOCRON_READ_TOKEN", keyringKey: "github.read" },
		],
	},
	"@theholocron/holocron-plugin-sentry": {
		tokens: [
			{ envName: "HOLOCRON_SENTRY_TOKEN", vendorEnvName: "SENTRY_AUTH_TOKEN", keyringKey: "sentry" },
			// Listed by two plugins under the same keyring entry: one token, written once.
			{ envName: "HOLOCRON_ORG_TOKEN", keyringKey: "github.org" },
		],
	},
};
const importer: AuthImporter = async (pkg) => {
	const found = TOKENS[pkg];
	if (!found) throw new Error(`MODULE_NOT_FOUND: ${pkg}`);
	return found;
};

const store = (entries: Record<string, string>) => (key: string) => entries[key] ?? null;
const KEYRING = { "github.org": "ghp_org", sentry: "sntry_1" };

function run(extra: Partial<Parameters<typeof runAuthExport>[0]> = {}) {
	const out: string[] = [];
	const err: string[] = [];
	const result = runAuthExport({
		loaded,
		importer,
		keyring: store(KEYRING),
		keyringAvailable: () => true,
		outKind: "pipe",
		out: (t) => out.push(t),
		print: (l) => err.push(l),
		logger: fakeLogger(),
		env: {},
		...extra,
	});
	return { result, out, err };
}

describe("auth export — what it writes", () => {
	it("writes NAME=value for each token the keyring has, once each, and says what it did not find", async () => {
		const { result, out, err } = run();
		expect(await result).toEqual({
			status: "ok",
			destination: "out",
			exported: ["HOLOCRON_ORG_TOKEN", "HOLOCRON_SENTRY_TOKEN"],
			missing: ["HOLOCRON_READ_TOKEN"],
			conflicts: [],
			unsupported: [],
			unavailable: [],
		});
		expect(out.join("")).toBe("HOLOCRON_ORG_TOKEN=ghp_org\nHOLOCRON_SENTRY_TOKEN=sntry_1\n");
		expect(err).toEqual([
			"exported 2 of 3: HOLOCRON_ORG_TOKEN, HOLOCRON_SENTRY_TOKEN",
			"not found: HOLOCRON_READ_TOKEN",
		]);
	});

	it("never puts a value in the messages or the log", async () => {
		const logger = fakeLogger();
		const { result, err } = run({ logger });
		await result;
		expect(JSON.stringify([err, logger.info.mock.calls])).not.toMatch(/ghp_org|sntry_1/);
		expect(logger.info).toHaveBeenCalledWith(
			{ exported: 2, missing: 1, conflicts: 0, unsupported: 0, unavailable: 0, status: "ok", destination: "out" },
			"auth export"
		);
	});

	it("takes a token from the environment ahead of the keyring only with fromEnv", async () => {
		const env = { HOLOCRON_READ_TOKEN: "ghp_read", SENTRY_AUTH_TOKEN: "from-env" };
		const without = run({ env });
		await without.result;
		expect(without.out.join("")).not.toContain("ghp_read");
		const withEnv = run({ env, fromEnv: true });
		await withEnv.result;
		expect(withEnv.out.join("")).toBe(
			"HOLOCRON_ORG_TOKEN=ghp_org\nHOLOCRON_READ_TOKEN=ghp_read\nHOLOCRON_SENTRY_TOKEN=from-env\n"
		);
	});

	it("takes the plugin's own variable before the vendor's with fromEnv", async () => {
		const env = { HOLOCRON_SENTRY_TOKEN: "own", SENTRY_AUTH_TOKEN: "vendor" };
		const { result, out } = run({ env, fromEnv: true });
		await result;
		expect(out.join("")).toContain("HOLOCRON_SENTRY_TOKEN=own\n");
	});

	it("is a skip that writes nothing when no token is found", async () => {
		const { result, out, err } = run({ keyring: () => null });
		const report = await result;
		expect(report.status).toBe("skip");
		expect(report.destination).toBeUndefined();
		expect(out).toEqual([]);
		expect(err[0]).toBe("exported 0 of 3: none");
	});

	it("passes over a plugin that lists no tokens", async () => {
		const { result } = run({ importer: async (pkg) => (pkg.endsWith("github") ? {} : importer(pkg)) });
		expect((await result).exported).toEqual(["HOLOCRON_SENTRY_TOKEN", "HOLOCRON_ORG_TOKEN"]);
	});
});

describe("auth export — where it writes", () => {
	it("puts the lines on the clipboard, and prints none, when stdout is a terminal", async () => {
		const copy = vi.fn(async (_text: string) => {});
		const { result, out, err } = run({ outKind: "terminal", copy });
		const report = await result;
		expect(copy).toHaveBeenCalledExactlyOnceWith("HOLOCRON_ORG_TOKEN=ghp_org\nHOLOCRON_SENTRY_TOKEN=sntry_1\n");
		expect(out).toEqual([]);
		expect(report.destination).toBe("clipboard");
		expect(err.at(-1)).toBe("copied to the clipboard: paste it, then clear the clipboard");
		expect(JSON.stringify(err)).not.toMatch(/ghp_org|sntry_1/);
	});

	it("copies with clipboardy by default", async () => {
		write.mockClear();
		const { result } = run({ outKind: "terminal" });
		await result;
		expect(write).toHaveBeenCalledExactlyOnceWith("HOLOCRON_ORG_TOKEN=ghp_org\nHOLOCRON_SENTRY_TOKEN=sntry_1\n");
	});

	it("copies nothing when no token is found, even on a terminal", async () => {
		const copy = vi.fn(async (_text: string) => {});
		const { result } = run({ outKind: "terminal", copy, keyring: () => null });
		expect((await result).status).toBe("skip");
		expect(copy).not.toHaveBeenCalled();
	});

	it("fails with a way out when the clipboard cannot be written, and writes nothing", async () => {
		const logger = fakeLogger();
		const copy = vi.fn(async () => Promise.reject(new Error("no clipboard tool")));
		const { result, out, err } = run({ outKind: "terminal", copy, logger });
		const report = await result;
		expect(report.status).toBe("fail");
		expect(report.exported).toEqual([]);
		expect(out).toEqual([]);
		expect(err[0]).toBe("could not copy to the clipboard: no clipboard tool");
		expect(err[1]).toMatch(/auth export \| some-tool/);
		expect(logger.warn).toHaveBeenCalledWith({ status: "fail", reason: "clipboard" }, "auth export");
	});

	it("refuses a regular file, without reading the keyring or writing anything", async () => {
		const keyring = vi.fn(() => "x");
		const { result, out, err } = run({ outKind: "other", keyring });
		expect((await result).status).toBe("fail");
		expect(keyring).not.toHaveBeenCalled();
		expect(out).toEqual([]);
		expect(err[0]).toMatch(/refusing to write tokens to a file/);
	});
});

describe("auth export — what it reports instead of hiding", () => {
	it("fails, naming the keyring, when the OS keyring cannot be reached, instead of calling every token missing", async () => {
		const keyring = vi.fn(() => null);
		const { result, err } = run({ keyringAvailable: () => false, keyring });
		expect((await result).status).toBe("fail");
		expect(keyring).not.toHaveBeenCalled();
		expect(err[0]).toBe("the OS keyring cannot be reached, so no stored token can be read");
	});

	it("asks the OS keyring itself when it is given no answer", async () => {
		const { result } = run({ keyringAvailable: undefined });
		expect((await result).status).toBe("ok");
	});

	it("does not export a name two plugins list under different keyring entries, and says so", async () => {
		const clash: AuthImporter = async (pkg) =>
			pkg.endsWith("sentry")
				? { tokens: [{ envName: "HOLOCRON_ORG_TOKEN", keyringKey: "other.org" }] }
				: importer(pkg);
		const { result, out, err } = run({ importer: clash, keyring: store({ ...KEYRING, "other.org": "different" }) });
		const report = await result;
		expect(report.conflicts).toEqual(["HOLOCRON_ORG_TOKEN"]);
		expect(report.exported).not.toContain("HOLOCRON_ORG_TOKEN");
		expect(out.join("")).not.toContain("HOLOCRON_ORG_TOKEN");
		expect(err.join("\n")).toContain(
			"not exported, listed by two plugins under different keyring entries: HOLOCRON_ORG_TOKEN"
		);
	});

	it("lists a conflicting name once, however many plugins disagree", async () => {
		const many: AuthImporter = async () => ({
			tokens: [
				{ envName: "A", keyringKey: "one" },
				{ envName: "A", keyringKey: "two" },
				{ envName: "A", keyringKey: "three" },
			],
		});
		const { result } = run({ importer: many });
		expect((await result).conflicts).toEqual(["A"]);
	});

	it("does not export a value dotenv cannot carry unchanged, and says so by name", async () => {
		const { result, out, err } = run({ keyring: store({ ...KEYRING, "github.org": "a'b\"c`d e" }) });
		const report = await result;
		expect(report.unsupported).toEqual(["HOLOCRON_ORG_TOKEN"]);
		expect(out.join("")).toBe("HOLOCRON_SENTRY_TOKEN=sntry_1\n");
		expect(err.join("\n")).toContain(
			"not exported, a value dotenv cannot carry unchanged (add it by hand): HOLOCRON_ORG_TOKEN"
		);
		expect(JSON.stringify(err)).not.toContain("a'b");
	});

	it("names a plugin it cannot load, and still exports the rest", async () => {
		const { result, err } = run({
			importer: async (pkg) => {
				if (pkg.endsWith("sentry")) throw new Error("MODULE_NOT_FOUND");
				return importer(pkg);
			},
		});
		const report = await result;
		expect(report.exported).toEqual(["HOLOCRON_ORG_TOKEN"]);
		expect(report.unavailable).toEqual(["@theholocron/holocron-plugin-sentry"]);
		expect(err.join("\n")).toContain(
			"could not load, so the tokens they take are not listed: @theholocron/holocron-plugin-sentry"
		);
	});

	it("throws the workspace error when no configured plugin can be loaded", async () => {
		const gone: AuthImporter = async () => {
			throw new Error("MODULE_NOT_FOUND");
		};
		const err = await run({ importer: gone }).result.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(WorkspaceContextError);
		expect((err as WorkspaceContextError).command).toBe("auth export");
	});
});

describe("auth export — defaults", () => {
	it("writes to stderr, and loads the plugins itself from the config's directory, when it is given none", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			await runAuthExport({ loaded, outKind: "pipe", out: () => {}, env: {} });
			expect(spy).toHaveBeenCalledWith(expect.stringMatching(/^exported 0 of \d+: none$/));
		} finally {
			spy.mockRestore();
		}
	});
});
