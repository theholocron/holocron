import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";

import { fakeLogger } from "@theholocron/observability/testing";
import chalk from "chalk";
import { describe, expect, it, vi } from "vitest";

// The real keychain and the real clipboard are things a test must never touch.
const write = vi.hoisted(() => vi.fn(async (_text: string) => {}));
vi.mock("clipboardy", () => ({ default: { write } }));
vi.mock("../../auth/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../auth/index.js")>()),
	getToken: () => null,
	isKeyringAvailable: () => true,
}));

const waitForEnter = vi.hoisted(() => vi.fn(async (_message: string) => {}));
vi.mock("../../ui/index.js", async (importActual) => ({
	...(await importActual<typeof import("../../ui/index.js")>()),
	waitForEnter,
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
		print: (l) => err.push(stripVTControlCharacters(l)),
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
			"exported 2 of 3:",
			"  ✓ HOLOCRON_ORG_TOKEN",
			"  ✓ HOLOCRON_SENTRY_TOKEN",
			"  · HOLOCRON_READ_TOKEN",
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

	it("finds a token stored for the org before the plain one, the way the commands do", async () => {
		const { result, out } = run({
			org: "acme",
			keyring: store({ "github.org.acme": "for-the-org", "github.org": "plain", sentry: "sntry_1" }),
		});
		await result;
		expect(out.join("")).toBe("HOLOCRON_ORG_TOKEN=for-the-org\nHOLOCRON_SENTRY_TOKEN=sntry_1\n");
	});

	it("falls back to the plain entry when none is stored for the org, and ignores another org's", async () => {
		const { result, out } = run({
			org: "acme",
			keyring: store({ "github.org": "plain", "sentry.other": "someone-else", sentry: "sntry_1" }),
		});
		await result;
		expect(out.join("")).toBe("HOLOCRON_ORG_TOKEN=plain\nHOLOCRON_SENTRY_TOKEN=sntry_1\n");
	});

	it("lists and writes the tokens in lexicographic order, whatever order the plugins list them in", async () => {
		const shuffled: AuthImporter = async () => ({
			tokens: [
				{ envName: "Z_TOKEN", keyringKey: "z" },
				{ envName: "B_TOKEN", keyringKey: "b" },
				{ envName: "A_MISSING", keyringKey: "nope" },
				{ envName: "A_TOKEN", keyringKey: "a" },
				{ envName: "C_MISSING", keyringKey: "nope2" },
			],
		});
		const { result, out, err } = run({ importer: shuffled, keyring: store({ a: "1", b: "2", z: "3" }) });
		const report = await result;
		expect(out.join("")).toBe("A_TOKEN=1\nB_TOKEN=2\nZ_TOKEN=3\n");
		expect(report.exported).toEqual(["A_TOKEN", "B_TOKEN", "Z_TOKEN"]);
		expect(report.missing).toEqual(["A_MISSING", "C_MISSING"]);
		expect(err).toEqual([
			"exported 3 of 5:",
			"  ✓ A_TOKEN",
			"  ✓ B_TOKEN",
			"  ✓ Z_TOKEN",
			"  · A_MISSING",
			"  · C_MISSING",
		]);
	});

	it("colours the ✓ green and dims the · but leaves the name as it is", async () => {
		const previous = chalk.level;
		chalk.level = 1;
		try {
			const raw: string[] = [];
			await runAuthExport({
				loaded,
				importer,
				keyring: store({ "github.org": "ghp_org" }),
				keyringAvailable: () => true,
				outKind: "pipe",
				out: () => {},
				print: (l) => raw.push(l),
				logger: fakeLogger(),
				env: {},
			});
			expect(raw).toContain(`  ${chalk.green("✓")} HOLOCRON_ORG_TOKEN`);
			expect(raw).toContain(`  ${chalk.dim("·")} HOLOCRON_READ_TOKEN`);
		} finally {
			chalk.level = previous;
		}
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
		expect(err).toEqual([
			"exported 0 of 3:",
			"  · HOLOCRON_ORG_TOKEN",
			"  · HOLOCRON_READ_TOKEN",
			"  · HOLOCRON_SENTRY_TOKEN",
		]);
	});

	it("passes over a plugin that lists no tokens", async () => {
		const { result } = run({ importer: async (pkg) => (pkg.endsWith("github") ? {} : importer(pkg)) });
		expect((await result).exported).toEqual(["HOLOCRON_ORG_TOKEN", "HOLOCRON_SENTRY_TOKEN"]);
	});
});

describe("auth export — where it writes", () => {
	it("puts the lines on the clipboard, and prints none, when asked for it", async () => {
		const copy = vi.fn(async (_text: string) => {});
		const { result, out, err } = run({ outKind: "terminal", to: "clipboard", copy });
		const report = await result;
		expect(copy).toHaveBeenCalledExactlyOnceWith("HOLOCRON_ORG_TOKEN=ghp_org\nHOLOCRON_SENTRY_TOKEN=sntry_1\n");
		expect(out).toEqual([]);
		expect(report.destination).toBe("clipboard");
		expect(err.at(-1)).toBe("copied to the clipboard: paste it, then clear the clipboard");
		expect(JSON.stringify(err)).not.toMatch(/ghp_org|sntry_1/);
	});

	it("copies with clipboardy by default", async () => {
		write.mockClear();
		const { result } = run({ outKind: "terminal", to: "clipboard" });
		await result;
		expect(write).toHaveBeenCalledExactlyOnceWith("HOLOCRON_ORG_TOKEN=ghp_org\nHOLOCRON_SENTRY_TOKEN=sntry_1\n");
	});

	it("copies nothing when no token is found, even on a terminal", async () => {
		const copy = vi.fn(async (_text: string) => {});
		const { result } = run({ outKind: "terminal", to: "clipboard", copy, keyring: () => null });
		expect((await result).status).toBe("skip");
		expect(copy).not.toHaveBeenCalled();
	});

	it("fails with a way out when the clipboard cannot be written, and writes nothing", async () => {
		const logger = fakeLogger();
		const copy = vi.fn(async () => Promise.reject(new Error("no clipboard tool")));
		const { result, out, err } = run({ outKind: "terminal", to: "clipboard", copy, logger });
		const report = await result;
		expect(report.status).toBe("fail");
		expect(report.exported).toEqual([]);
		expect(out).toEqual([]);
		expect(err[0]).toBe("could not copy to the clipboard: no clipboard tool");
		expect(err[1]).toMatch(/auth export --file/);
		expect(logger.warn).toHaveBeenCalledWith({ status: "fail", reason: "clipboard" }, "auth export");
	});

	it("refuses a redirect to a regular file, without reading the keyring or writing anything", async () => {
		const keyring = vi.fn(() => "x");
		const { result, out, err } = run({ outKind: "other", keyring });
		expect((await result).status).toBe("fail");
		expect(keyring).not.toHaveBeenCalled();
		expect(out).toEqual([]);
		expect(err[0]).toMatch(/refusing to write tokens to a redirected file/);
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
			"  ✗ HOLOCRON_ORG_TOKEN  (listed by two plugins under different keyring entries, so not exported)"
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
			"  ✗ HOLOCRON_ORG_TOKEN  (a value dotenv cannot carry unchanged, so add it by hand)"
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
		expect(err).toContain("could not load, so the tokens they take are not listed:");
		expect(err).toContain("  ✗ @theholocron/holocron-plugin-sentry  (MODULE_NOT_FOUND)");
	});

	it("gives the first line of why a plugin could not be loaded, not a stack", async () => {
		const { result, err } = run({
			importer: async (pkg) => {
				if (pkg.endsWith("sentry"))
					throw new Error("Cannot find module 'libsodium'\nRequire stack:\n- /x/y.js");
				return importer(pkg);
			},
		});
		await result;
		const line = err.find((l) => l.includes("holocron-plugin-sentry"));
		expect(line).toContain("(Cannot find module 'libsodium')");
		expect(err.join("\n")).not.toContain("Require stack");
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
			expect(spy).toHaveBeenCalledWith(expect.stringMatching(/^exported 0 of \d+:$/));
		} finally {
			spy.mockRestore();
		}
	});
});

describe("auth export — the private file", () => {
	const fresh = () => {
		const dir = mkdtempSync(join(tmpdir(), "holocron-export-"));
		const here: LoadedConfig = { ...loaded, filepath: join(dir, "holocron.config.json") };
		return { dir, here, file: join(dir, ".credentials") };
	};
	const CONTENT = "HOLOCRON_ORG_TOKEN=ghp_org\nHOLOCRON_SENTRY_TOKEN=sntry_1\n";
	const gone = (): "deleted" => "deleted";
	const base = {
		outKind: "terminal" as const,
		interactive: true,
		isIgnored: () => "ignored" as const,
		waitForImport: async () => {},
		shred: gone,
	};

	it("on a terminal writes a private .credentials next to the config, prints no value, then deletes it", async () => {
		const { here, file } = fresh();
		const remove = vi.fn((p: string, identity: { dev: number; ino: number; fd: number }) => {
			expect(readFileSync(p, "utf8")).toBe(CONTENT);
			expect(statSync(p).mode & 0o777).toBe(0o600);
			// It is handed the identity of the file it wrote, so it can tell that file from a replacement.
			expect(identity).toMatchObject({ dev: statSync(p).dev, ino: statSync(p).ino });
			expect(typeof identity.fd).toBe("number");
			return gone();
		});
		const { result, out, err } = run({ ...base, loaded: here, shred: remove });
		const report = await result;
		expect(report).toMatchObject({ status: "ok", destination: "file", file });
		expect(remove).toHaveBeenCalledOnce();
		expect(out).toEqual([]);
		expect(JSON.stringify(err)).not.toMatch(/ghp_org|sntry_1/);
		expect(err).toContain(`wrote ${file} (readable only by you)`);
		// A blank line sets what happened to the file apart from the list of tokens.
		expect(err[err.indexOf(`wrote ${file} (readable only by you)`) - 1]).toBe("");
		expect(err.at(-1)).toBe(`deleted ${file}`);
	});

	it("keeps the file until the import is released, and deletes it only after", async () => {
		const { here } = fresh();
		let release: () => void = () => {};
		const waiting = new Promise<void>((resolve) => (release = resolve));
		const remove = vi.fn(gone);
		const { result, err } = run({ ...base, loaded: here, shred: remove, waitForImport: () => waiting });
		let done = false;
		void result.then(() => (done = true));
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(done).toBe(false);
		expect(remove).not.toHaveBeenCalled();
		expect(err.some((l) => l.startsWith("deleted "))).toBe(false);
		release();
		await result;
		expect(remove).toHaveBeenCalledOnce();
	});

	it("deletes the file even when waiting fails", async () => {
		const { here } = fresh();
		const remove = vi.fn(gone);
		const { result } = run({
			...base,
			loaded: here,
			shred: remove,
			waitForImport: async () => Promise.reject(new Error("stdin closed")),
		});
		await expect(result).rejects.toThrow("stdin closed");
		expect(remove).toHaveBeenCalledOnce();
	});

	it.each([
		["SIGINT", 130],
		["SIGTERM", 143],
		["SIGHUP", 129],
	] as const)("deletes the file on %s and exits %i, leaving no handler behind", async (signal, code) => {
		const { here } = fresh();
		const before = process.listenerCount(signal);
		const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
		const remove = vi.fn(gone);
		try {
			const { result } = run({
				...base,
				loaded: here,
				shred: remove,
				waitForImport: async () => void process.emit(signal),
			});
			await result;
			expect(exit).toHaveBeenCalledWith(code);
			expect(remove).toHaveBeenCalled();
			expect(process.listenerCount(signal)).toBe(before);
		} finally {
			exit.mockRestore();
		}
	});

	it("does not say it deleted a file that was already gone, or that someone else replaced", async () => {
		const { here, file } = fresh();
		const missing = run({ ...base, loaded: here, shred: () => "missing" });
		expect((await missing.result).status).toBe("ok");
		expect(missing.err.at(-1)).toBe(`${file} was already gone`);
		const other = fresh();
		const replaced = run({ ...base, loaded: other.here, shred: () => "replaced" });
		expect((await replaced.result).status).toBe("ok");
		expect(replaced.err.at(-1)).toBe(`left ${other.file} alone: it is no longer the file this command wrote`);
	});

	it("fails, and never says deleted, when the file could not be deleted", async () => {
		const { here, file } = fresh();
		const { result, err } = run({
			...base,
			loaded: here,
			shred: () => {
				throw new Error("EPERM: operation not permitted");
			},
		});
		expect((await result).status).toBe("fail");
		expect(err.some((l) => l.startsWith("deleted "))).toBe(false);
		expect(err).toContain(`could not delete ${file}: EPERM: operation not permitted`);
		expect(err.at(-1)).toBe(`it holds your tokens in plain text: delete it yourself: ${file}`);
	});

	it("keeps the file with --keep, and says to delete it", async () => {
		const { here, file } = fresh();
		const remove = vi.fn(gone);
		const { result, err } = run({ ...base, loaded: here, shred: remove, keep: true });
		await result;
		expect(remove).not.toHaveBeenCalled();
		expect(existsSync(file)).toBe(true);
		expect(err.at(-1)).toBe(`it holds your tokens in plain text: delete it when you are done: ${file}`);
	});

	it("keeps the file, and says so, when there is no terminal to ask on", async () => {
		const { here, file } = fresh();
		const remove = vi.fn(gone);
		const waitForImport = vi.fn(async () => {});
		const { result, err } = run({ ...base, loaded: here, shred: remove, waitForImport, interactive: false });
		await result;
		expect(waitForImport).not.toHaveBeenCalled();
		expect(remove).not.toHaveBeenCalled();
		expect(err.at(-1)).toContain(`delete it when you are done: ${file}`);
	});

	it.each([
		["tracked", "git does not ignore it, so it could be committed"],
		["unknown", "git could not say whether it ignores it"],
	] as const)("refuses a path git reports as %s, and writes nothing", async (state, reason) => {
		const { here, file } = fresh();
		const { result, err } = run({ ...base, loaded: here, isIgnored: () => state });
		expect((await result).status).toBe("fail");
		expect(existsSync(file)).toBe(false);
		expect(err[0]).toContain(reason);
	});

	it.each(["ignored", "no-repo"] as const)("writes when git says %s", async (state) => {
		const { here, file } = fresh();
		const { result } = run({ ...base, loaded: here, isIgnored: () => state, keep: true });
		expect((await result).status).toBe("ok");
		expect(existsSync(file)).toBe(true);
	});

	it("refuses on Windows, where the mode does not make a file private, and points at the other ways", async () => {
		const { here, file } = fresh();
		const { result, err } = run({ ...base, loaded: here, platform: "win32" });
		expect((await result).status).toBe("fail");
		expect(existsSync(file)).toBe(false);
		expect(err[0]).toContain("cannot make the file private on Windows");
		expect(err[1]).toContain("--copy");
	});

	it("never overwrites a file that is there, and says how to replace it", async () => {
		const { here, file } = fresh();
		writeFileSync(file, "keep me");
		const { result, err } = run({ ...base, loaded: here });
		expect((await result).status).toBe("fail");
		expect(readFileSync(file, "utf8")).toBe("keep me");
		expect(err[0]).toContain(`could not write ${file}`);
		expect(err[1]).toContain("--force");
	});

	it("replaces it with --force", async () => {
		const { here, file } = fresh();
		writeFileSync(file, "old");
		const { result } = run({ ...base, loaded: here, force: true, keep: true });
		expect((await result).status).toBe("ok");
		expect(readFileSync(file, "utf8")).toBe(CONTENT);
	});

	it("writes the file when asked even if stdout is a pipe, at a path given relative to the config", async () => {
		const { dir, here } = fresh();
		const { result, out } = run({
			...base,
			loaded: here,
			outKind: "pipe",
			to: "file",
			file: "sub.env",
			keep: true,
		});
		const report = await result;
		expect(report.file).toBe(join(dir, "sub.env"));
		expect(readFileSync(join(dir, "sub.env"), "utf8")).toBe(CONTENT);
		expect(out).toEqual([]);
	});

	it("uses the real writer, git check and remover, and the terminal prompt, by default", async () => {
		const { here, file } = fresh();
		waitForEnter.mockClear();
		const { result } = run({ outKind: "terminal", interactive: true, loaded: here });
		expect((await result).status).toBe("ok");
		expect(waitForEnter).toHaveBeenCalledOnce();
		// Not a git repository, so there is no objection, and the real remover has deleted it.
		expect(existsSync(file)).toBe(false);
	});
});
