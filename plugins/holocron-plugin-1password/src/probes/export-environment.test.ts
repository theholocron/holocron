import type { ProbeContext, ProbeRow } from "@theholocron/cli";
import { ProviderApiError } from "@theholocron/cli";
import type { FileIdentity } from "@theholocron/kyber/secrets";
import { describe, expect, it, vi } from "vitest";

import { exportEnvironmentProbe } from "./export-environment.js";
import type { ExportEnvironmentDeps } from "./export-environment.type.js";

/** A value no output may ever contain. */
const SECRET = "s3ntinel-VALUE-do-not-print-0451";
const OTHER = "second value with spaces";
const IDENTITY: FileIdentity = { dev: 1, ino: 2, fd: -1 };

function fakeCtx(args: string[], dryRun = false) {
	const rows: ProbeRow[] = [];
	const secrets: string[] = [];
	const writes: string[] = [];
	const undo: Array<() => Promise<void>> = [];
	const ctx: ProbeContext = {
		args,
		dryRun,
		say: (row) => void rows.push(row),
		secret: (value) => void (value && secrets.push(value)),
		async write(label, fn) {
			writes.push(label);
			if (dryRun) {
				rows.push({ status: "info", label: `would ${label}` });
				return undefined;
			}
			return fn();
		},
		cleanup: (_label, fn) => void undo.push(fn),
	};
	// Like the runner: a cleanup that throws is a failing row, and the rest still run.
	const cleanups = async () => {
		while (undo.length > 0) {
			try {
				await undo.pop()!();
			} catch (err) {
				rows.push({ status: "fail", label: "could not clean up", detail: (err as Error).message });
			}
		}
	};
	return { ctx, rows, secrets, writes, cleanups };
}

function fakeDeps(over: Partial<ExportEnvironmentDeps> = {}) {
	const out: string[] = [];
	const copied: string[] = [];
	const written: Array<{ path: string; text: string; force: boolean }> = [];
	const shredded: string[] = [];
	const deps: ExportEnvironmentDeps = {
		read: vi.fn(async () => ({ B_TOKEN: SECRET, A_NAME: OTHER })),
		repoRoot: "/repo",
		resolveId: vi.fn(async (id: string) => id),
		outKind: () => "terminal",
		out: (text) => void out.push(text),
		copy: async (text) => void copied.push(text),
		writeFile: (path, text, force) => {
			written.push({ path, text, force });
			return IDENTITY;
		},
		shred: (path) => {
			shredded.push(path);
			return "deleted";
		},
		isIgnored: () => "ignored",
		platform: "darwin",
		interactive: true,
		waitForImport: async () => {},
		...over,
	};
	return { deps, out, copied, written, shredded };
}

/** Runs the probe the way the runner does: reports a throw as a failing row, then runs the cleanups. */
async function run(args: string[], over: Partial<ExportEnvironmentDeps> = {}, dryRun = false) {
	const d = fakeDeps(over);
	const c = fakeCtx(args, dryRun);
	let error: unknown;
	try {
		await exportEnvironmentProbe(d.deps).run(c.ctx);
	} catch (err) {
		error = err;
		c.rows.push({ status: "fail", label: "export-environment", detail: (err as Error).message });
	}
	await c.cleanups();
	return { ...d, ...c, error };
}

/** Everything a person or a log could see: the rows and any error. */
const visible = (r: { rows: ProbeRow[]; error?: unknown }) =>
	JSON.stringify(r.rows) + String((r.error as Error | undefined)?.message ?? "");

describe("exportEnvironmentProbe", () => {
	it("declares itself a writer whose rows go to stderr", () => {
		const probe = exportEnvironmentProbe(fakeDeps().deps);
		expect(probe.writes).toBe(true);
		expect(probe.reportsTo).toBe("stderr");
	});

	describe("to the private file", () => {
		it("writes sorted NAME=value lines to .credentials next to the config, never forcing, and deletes it after the import", async () => {
			const r = await run(["Sentinel - dev"]);
			expect(r.written).toEqual([
				{
					path: "/repo/.credentials",
					text: `A_NAME='${OTHER}'\nB_TOKEN=${SECRET.replace(/^/, "")}\n`.replace(`'${OTHER}'`, `'${OTHER}'`),
					force: false,
				},
			]);
			expect(r.shredded.length).toBeGreaterThanOrEqual(1);
			expect(r.shredded[0]).toBe("/repo/.credentials");
			expect(r.error).toBeUndefined();
			expect(r.rows.some((row) => /import it in the 1Password app/.test(row.label))).toBe(true);
			expect(visible(r)).not.toContain(SECRET);
			expect(visible(r)).not.toContain(OTHER);
		});

		it("registers every value for scrubbing", async () => {
			const r = await run(["x"]);
			expect(r.secrets.sort()).toEqual([OTHER, SECRET].sort());
		});

		it("reports names only", async () => {
			const r = await run(["x"]);
			const labels = r.rows.map((row) => row.label);
			expect(labels).toContain("A_NAME");
			expect(labels).toContain("B_TOKEN");
			expect(labels.join("\n")).toMatch(/2 of 2 variables/);
		});

		it("refuses when the file is not git-ignored, or git cannot say", async () => {
			for (const state of ["tracked", "unknown"] as const) {
				const r = await run(["x"], { isIgnored: () => state });
				expect(r.written).toEqual([]);
				expect((r.error as Error).message).toMatch(/refusing to write secrets to \/repo\/\.credentials/);
				expect(visible(r)).not.toContain(SECRET);
			}
		});

		it("accepts a path outside any git repository", async () => {
			const r = await run(["x"], { isIgnored: () => "no-repo" });
			expect(r.written).toHaveLength(1);
		});

		it("never overwrites: a file that exists is an error that names no value", async () => {
			const r = await run(["x"], {
				writeFile: () => {
					throw new Error("EEXIST: file already exists, open '/repo/.credentials'");
				},
			});
			expect((r.error as Error).message).toMatch(/could not write \/repo\/\.credentials.*never overwritten/);
			expect(r.shredded).toEqual([]);
			expect(visible(r)).not.toContain(SECRET);
		});

		it("words a write failure that is not an Error", async () => {
			const r = await run(["x"], {
				writeFile: () => {
					throw "boom";
				},
			});
			expect((r.error as Error).message).toMatch(/unknown error/);
		});

		it("deletes the file when the wait for the import fails", async () => {
			const r = await run(["x"], {
				waitForImport: async () => {
					throw new Error("input closed");
				},
			});
			expect((r.error as Error).message).toBe("input closed");
			expect(r.shredded).toContain("/repo/.credentials");
		});

		it("deletes the file on abort: the registered cleanup runs while the wait is still open", async () => {
			let release!: () => void;
			const waiting = new Promise<void>((done) => (release = done));
			const d = fakeDeps({ waitForImport: () => waiting });
			const c = fakeCtx(["x"]);
			const pending = exportEnvironmentProbe(d.deps).run(c.ctx);
			await vi.waitFor(() => expect(d.written).toHaveLength(1));
			expect(d.shredded).toEqual([]);
			await c.cleanups();
			expect(d.shredded).toEqual(["/repo/.credentials"]);
			release();
			await pending;
		});

		it("fails loudly when the file could not be deleted", async () => {
			const r = await run(["x"], {
				shred: () => {
					throw new Error("EPERM");
				},
			});
			expect(r.rows.some((row) => row.status === "fail" && /still on disk/.test(row.label))).toBe(true);
			expect(r.rows.some((row) => row.status === "fail" && /could not clean up/.test(row.label))).toBe(true);
		});

		it("leaves the file and says so without a terminal for the wait... which it refuses up front", async () => {
			const r = await run(["x"], { interactive: false });
			expect((r.error as Error).message).toMatch(/needs a terminal/);
			expect(r.written).toEqual([]);
		});

		it("refuses on Windows, where the file cannot be made private", async () => {
			const r = await run(["x"], { platform: "win32" });
			expect((r.error as Error).message).toMatch(/Windows/);
			expect(r.written).toEqual([]);
		});
	});

	describe("to stdout and the clipboard", () => {
		it("gives a pipe the lines, and no file", async () => {
			const r = await run(["x"], { outKind: () => "pipe" });
			expect(r.out).toEqual([`A_NAME='${OTHER}'\nB_TOKEN=${SECRET}\n`]);
			expect(r.written).toEqual([]);
			expect(visible(r)).not.toContain(SECRET);
		});

		it("refuses a redirected file", async () => {
			const r = await run(["x"], { outKind: () => "other" });
			expect((r.error as Error).message).toMatch(/redirected file/);
			expect(r.out).toEqual([]);
			expect(r.written).toEqual([]);
		});

		it("puts the lines on the clipboard with --copy, even on a terminal or a pipe", async () => {
			for (const kind of ["terminal", "pipe", "other"] as const) {
				const r = await run(["x", "--copy"], { outKind: () => kind });
				expect(r.copied).toEqual([`A_NAME='${OTHER}'\nB_TOKEN=${SECRET}\n`]);
				expect(r.out).toEqual([]);
				expect(r.written).toEqual([]);
				expect(visible(r)).not.toContain(SECRET);
			}
		});

		it("reports a clipboard that fails without the value", async () => {
			const r = await run(["x", "--copy"], {
				copy: async () => {
					throw new Error("no clipboard tool");
				},
			});
			expect((r.error as Error).message).toBe("no clipboard tool");
		});
	});

	describe("the Environment", () => {
		it("resolves a layer word, then reads the result", async () => {
			const resolveId = vi.fn(async () => "theholocron/holocron - prod");
			const read = vi.fn(async () => ({ A: SECRET }));
			const r = await run(["prod"], { resolveId, read });
			expect(resolveId).toHaveBeenCalledWith("prod", "/repo");
			expect(read).toHaveBeenCalledWith("theholocron/holocron - prod");
			expect(r.rows.map((row) => row.label).join("\n")).toContain(
				"theholocron/holocron - prod: 1 of 1 variables"
			);
		});

		it("exports only the names asked for, once each", async () => {
			const r = await run(["x", "--only", "B_TOKEN", "--only", "B_TOKEN"]);
			expect(r.written[0]!.text).toBe(`B_TOKEN=${SECRET}\n`);
			expect(r.secrets).toEqual([SECRET]);
		});

		it("refuses a name the Environment does not have, and writes nothing", async () => {
			const r = await run(["x", "--only", "NOPE"]);
			expect((r.error as Error).message).toMatch(/has no variable named NOPE/);
			expect(r.written).toEqual([]);
		});

		it("says an empty Environment has nothing to export, and writes nothing", async () => {
			const r = await run(["x"], { read: async () => ({}) });
			expect(r.error).toBeUndefined();
			expect(r.rows[0]).toMatchObject({ status: "info", detail: expect.stringMatching(/no variables/) });
			expect(r.written).toEqual([]);
			expect(r.writes).toEqual([]);
		});

		it("reports an Environment that cannot be read, without writing", async () => {
			const r = await run(["x"], {
				read: async () => {
					throw new ProviderApiError('1Password has no Environment named "x"', 404, undefined);
				},
			});
			expect((r.error as Error).message).toMatch(/no Environment named "x"/);
			expect(r.written).toEqual([]);
			expect(r.out).toEqual([]);
		});

		it("fails a value dotenv cannot carry and still exports the rest", async () => {
			const tricky = "a\"b'c`d";
			const r = await run(["x"], { read: async () => ({ BAD: tricky, OK: "fine" }) });
			expect(r.rows.some((row) => row.status === "fail" && row.label === "BAD")).toBe(true);
			expect(r.written[0]!.text).toBe("OK=fine\n");
			expect(visible(r)).not.toContain(tricky);
		});

		it("writes nothing when no value is carriable", async () => {
			const r = await run(["x"], { read: async () => ({ BAD: "a\"b'c`d" }) });
			expect(r.written).toEqual([]);
			expect(r.writes).toEqual([]);
		});

		it("takes the Environment from the arguments, and refuses bad ones before reading", async () => {
			const read = vi.fn(async () => ({}));
			const r = await run([], { read });
			expect(r.error).toBeInstanceOf(Error);
			expect(read).not.toHaveBeenCalled();
		});

		it("falls back to no arguments at all", async () => {
			const d = fakeDeps();
			const c = fakeCtx([]);
			const { args: _args, ...noArgs } = c.ctx;
			await expect(exportEnvironmentProbe(d.deps).run(noArgs as ProbeContext)).rejects.toThrow(
				/name one Environment/
			);
		});
	});

	describe("--dry-run", () => {
		it("lists names and a count, writes nothing and leaves no cleanup", async () => {
			const r = await run(["x"], {}, true);
			expect(r.written).toEqual([]);
			expect(r.out).toEqual([]);
			expect(r.copied).toEqual([]);
			expect(r.shredded).toEqual([]);
			const labels = r.rows.map((row) => row.label);
			expect(labels).toContain("A_NAME");
			expect(labels).toContain("B_TOKEN");
			expect(labels.join("\n")).toMatch(/would write 2 variables to \.credentials/);
			expect(visible(r)).not.toContain(SECRET);
			expect(visible(r)).not.toContain(OTHER);
		});

		it("names the destination it would use", async () => {
			const pipe = await run(["x"], { outKind: () => "pipe" }, true);
			expect(pipe.rows.map((row) => row.label).join("\n")).toMatch(/would write 2 variables to stdout/);
			const copy = await run(["x", "--copy"], {}, true);
			expect(copy.rows.map((row) => row.label).join("\n")).toMatch(/would write 2 variables to clipboard/);
		});
	});
});
