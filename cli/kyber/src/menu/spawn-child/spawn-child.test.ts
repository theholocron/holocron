import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({ spawn: (...args: unknown[]) => spawnMock(...args) }));

const { spawnChild } = await import("./spawn-child.js");

describe("spawnChild", () => {
	beforeEach(() => spawnMock.mockReset());

	it("re-runs the current script with inherited stdio and the update notifier off, layering extra env", async () => {
		const child = new EventEmitter();
		spawnMock.mockReturnValue(child);
		const done = spawnChild(["doctor"], { MYCLI_X: "1" });
		child.emit("exit", 3);
		await expect(done).resolves.toBe(3);
		expect(spawnMock).toHaveBeenCalledWith(process.execPath, [process.argv[1], "doctor"], {
			stdio: "inherit",
			env: { ...process.env, NO_UPDATE_NOTIFIER: "1", MYCLI_X: "1" },
		});
	});

	it("treats a null exit code as 0", async () => {
		const child = new EventEmitter();
		spawnMock.mockReturnValue(child);
		const done = spawnChild([]);
		child.emit("exit", null);
		await expect(done).resolves.toBe(0);
	});

	it("resolves 1 when spawn itself errors", async () => {
		const child = new EventEmitter();
		spawnMock.mockReturnValue(child);
		const done = spawnChild([]);
		child.emit("error", new Error("ENOENT"));
		await expect(done).resolves.toBe(1);
	});
});
