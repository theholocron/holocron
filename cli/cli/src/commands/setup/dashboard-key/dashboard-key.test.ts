import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DASHBOARD_KEY_VARIABLE, handOffDashboardKey } from "./dashboard-key.js";

const KEY = "view-key-value-123";
let root: string;
let lines: string[];

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "dashboard-key-"));
	lines = [];
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const file = () => join(root, ".holocron/.private/.credentials");
const base = () => ({
	key: KEY,
	repoRoot: root,
	print: (l: string) => void lines.push(l),
	isIgnored: () => "ignored" as const,
});

describe("handOffDashboardKey", () => {
	it("writes one HOLOCRON_CHECKLY_DASHBOARD_KEY line to the private file and prints no key", async () => {
		await handOffDashboardKey({ ...base(), interactive: false });
		expect(readFileSync(file(), "utf8")).toBe(`${DASHBOARD_KEY_VARIABLE}=${KEY}\n`);
		expect(lines.join("\n")).not.toContain(KEY);
		expect(lines.join("\n")).toContain("wrote");
	});

	it("deletes the file once the import is done, on a terminal", async () => {
		await handOffDashboardKey({ ...base(), interactive: true, waitForImport: async () => undefined });
		expect(existsSync(file())).toBe(false);
		expect(lines.join("\n")).not.toContain(KEY);
	});

	it("refuses when git does not ignore the file", async () => {
		const err = await handOffDashboardKey({ ...base(), isIgnored: () => "tracked", interactive: false }).catch(
			(e: unknown) => e
		);
		expect((err as Error).message).toMatch(/git does not ignore it/);
		expect((err as Error).message).not.toContain(KEY);
		expect(existsSync(file())).toBe(false);
	});

	it("refuses when git cannot say", async () => {
		const err = await handOffDashboardKey({ ...base(), isIgnored: () => "unknown", interactive: false }).catch(
			(e: unknown) => e
		);
		expect((err as Error).message).toMatch(/could not say/);
	});

	it("never overwrites an existing file", async () => {
		await handOffDashboardKey({ ...base(), interactive: false });
		writeFileSync(file(), "old\n");
		const err = await handOffDashboardKey({ ...base(), key: "another", interactive: false }).catch(
			(e: unknown) => e
		);
		expect((err as Error).message).toMatch(/never overwritten/);
		expect(readFileSync(file(), "utf8")).toBe("old\n");
	});

	it("refuses on Windows, where the file cannot be made private", async () => {
		const err = await handOffDashboardKey({ ...base(), platform: "win32" }).catch((e: unknown) => e);
		expect((err as Error).message).toMatch(/Windows/);
	});

	it("refuses a key dotenv cannot carry", async () => {
		const err = await handOffDashboardKey({ ...base(), key: `a"b'c\`d\n` }).catch((e: unknown) => e);
		expect((err as Error).message).toMatch(/dotenv cannot carry/);
		expect((err as Error).message).not.toContain('a"b');
	});

	it("fails when the file could not be deleted", async () => {
		const err = await handOffDashboardKey({
			...base(),
			interactive: true,
			waitForImport: async () => undefined,
			shred: () => {
				throw new Error("busy");
			},
		}).catch((e: unknown) => e);
		expect((err as Error).message).toMatch(/plain text/);
	});

	it("asks git itself when no answer is given, and never prints the key whichever way git answers", async () => {
		const { isIgnored: _injected, ...withoutGit } = base();
		const result = await handOffDashboardKey({ ...withoutGit, interactive: false }).then(
			() => undefined,
			(e: unknown) => e
		);
		expect(lines.join("\n")).not.toContain(KEY);
		expect(result instanceof Error ? result.message : "").not.toContain(KEY);
	});

	it("takes whether it is on a terminal from the process when the caller does not say", async () => {
		// With a terminal the injected wait ends the import at once; without one the file is left as a note says.
		await handOffDashboardKey({ ...base(), waitForImport: async () => undefined });
		expect(lines.join("\n")).not.toContain(KEY);
	});
});
