import type { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

// Nothing here may start a real process.
const spawnMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawn: spawnMock }));

import { superviseProcesses } from "./supervise-processes.js";

const child = () => Object.assign(new EventEmitter(), { kill: vi.fn() });

function setup() {
	const primary = child();
	const companion = child();
	const spawnImpl = vi.fn((command: string) => (command === "main" ? primary : companion)) as unknown as typeof spawn;
	const input = {
		primary: { command: "main", args: ["run", "serve"], env: { A: "1" } },
		companion: { command: "sidecar", args: ["tunnel", "run"], env: { SECRET: "S" } },
		spawn: spawnImpl,
	};
	return { primary, companion, input, spawnImpl: spawnImpl as unknown as ReturnType<typeof vi.fn> };
}

describe("superviseProcesses", () => {
	it("starts both in the foreground with their own variables added to the environment", () => {
		const { input, spawnImpl, primary, companion } = setup();
		void superviseProcesses(input);
		const [[primaryCmd, primaryArgs, primaryOpts], [conCmd, conArgs, conOpts]] = spawnImpl.mock.calls as Array<
			[string, string[], { stdio: string; env: Record<string, string> }]
		>;
		expect([primaryCmd, primaryArgs, primaryOpts.stdio, primaryOpts.env["A"]]).toEqual([
			"main",
			["run", "serve"],
			"inherit",
			"1",
		]);
		expect([conCmd, conArgs, conOpts.env["SECRET"]]).toEqual(["sidecar", ["tunnel", "run"], "S"]);
		// The secret is in the companion's environment only.
		expect(primaryOpts.env["SECRET"]).toBeUndefined();
		primary.emit("exit", 0);
		companion.emit("exit", 0);
	});

	it("stops the companion when the primary ends, and reports the primary's status", async () => {
		const { input, primary, companion } = setup();
		const done = superviseProcesses(input);
		primary.emit("exit", 3);
		expect(companion.kill).toHaveBeenCalledWith("SIGTERM");
		companion.emit("exit", null);
		expect(await done).toEqual({ exitCode: 3, endedFirst: "primary", interrupted: false });
	});

	it("stops the primary when the companion ends, and says 1 for one killed by a signal", async () => {
		const { input, primary, companion } = setup();
		const done = superviseProcesses(input);
		companion.emit("exit", null);
		expect(primary.kill).toHaveBeenCalledWith("SIGTERM");
		primary.emit("exit", 0);
		expect(await done).toEqual({ exitCode: 1, endedFirst: "companion", interrupted: false });
	});

	it("passes Ctrl-C and a termination signal to both, and does not call that a failure", async () => {
		const { input, primary, companion } = setup();
		const before = process.listenerCount("SIGINT");
		const done = superviseProcesses(input);
		expect(process.listenerCount("SIGINT")).toBe(before + 1);
		process.emit("SIGINT");
		process.emit("SIGTERM");
		expect(primary.kill).toHaveBeenCalledWith("SIGINT");
		expect(companion.kill).toHaveBeenCalledWith("SIGTERM");
		primary.emit("exit", 130);
		companion.emit("exit", 0);
		expect(await done).toMatchObject({ exitCode: 0, interrupted: true });
		expect(process.listenerCount("SIGINT")).toBe(before);
	});

	it("rejects naming the program that is not installed, and stops the other", async () => {
		const { input, primary, companion } = setup();
		const done = superviseProcesses(input);
		companion.emit("error", Object.assign(new Error("spawn sidecar ENOENT"), { code: "ENOENT" }));
		await expect(done).rejects.toThrow("sidecar is not installed or not on the PATH");
		expect(primary.kill).toHaveBeenCalledWith("SIGTERM");
	});

	it("rejects with the reason for any other failure to start, once", async () => {
		const { input, primary, companion } = setup();
		const done = superviseProcesses(input);
		primary.emit("error", new Error("EACCES"));
		companion.emit("error", new Error("again"));
		await expect(done).rejects.toThrow("could not start main: EACCES");
	});

	it("uses the platform's spawn when none is given", async () => {
		const primary = child();
		const companion = child();
		spawnMock.mockReturnValueOnce(primary).mockReturnValueOnce(companion);
		const { spawn: _unused, ...rest } = setup().input;
		const done = superviseProcesses(rest);
		primary.emit("exit", 0);
		companion.emit("exit", 0);
		expect((await done).exitCode).toBe(0);
	});
});
