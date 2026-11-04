import type { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

// Nothing here may start a real process.
const spawnMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawn: spawnMock }));

import { runDevProcesses } from "./run-dev-processes.js";

const child = () => Object.assign(new EventEmitter(), { kill: vi.fn() });

function setup() {
	const app = child();
	const connector = child();
	const spawnImpl = vi.fn((command: string) => (command === "pnpm" ? app : connector)) as unknown as typeof spawn;
	const input = {
		app: { command: "pnpm", args: ["run", "serve"], env: { A: "1" } },
		connector: { command: "cloudflared", args: ["tunnel", "run"], env: { TUNNEL_TOKEN: "TOK" } },
		spawn: spawnImpl,
	};
	return { app, connector, input, spawnImpl: spawnImpl as unknown as ReturnType<typeof vi.fn> };
}

describe("runDevProcesses", () => {
	it("starts both in the foreground with their own variables added to the environment", () => {
		const { input, spawnImpl, app, connector } = setup();
		void runDevProcesses(input);
		const [[appCmd, appArgs, appOpts], [conCmd, conArgs, conOpts]] = spawnImpl.mock.calls as Array<
			[string, string[], { stdio: string; env: Record<string, string> }]
		>;
		expect([appCmd, appArgs, appOpts.stdio, appOpts.env["A"]]).toEqual(["pnpm", ["run", "serve"], "inherit", "1"]);
		expect([conCmd, conArgs, conOpts.env["TUNNEL_TOKEN"]]).toEqual(["cloudflared", ["tunnel", "run"], "TOK"]);
		// The token is in the connector's environment only.
		expect(appOpts.env["TUNNEL_TOKEN"]).toBeUndefined();
		app.emit("exit", 0);
		connector.emit("exit", 0);
	});

	it("stops the connector when the app ends, and reports the app's status", async () => {
		const { input, app, connector } = setup();
		const done = runDevProcesses(input);
		app.emit("exit", 3);
		expect(connector.kill).toHaveBeenCalledWith("SIGTERM");
		connector.emit("exit", null);
		expect(await done).toEqual({ exitCode: 3, endedFirst: "app", interrupted: false });
	});

	it("stops the app when the connector ends, and says 1 for one killed by a signal", async () => {
		const { input, app, connector } = setup();
		const done = runDevProcesses(input);
		connector.emit("exit", null);
		expect(app.kill).toHaveBeenCalledWith("SIGTERM");
		app.emit("exit", 0);
		expect(await done).toEqual({ exitCode: 1, endedFirst: "connector", interrupted: false });
	});

	it("passes Ctrl-C and a termination signal to both, and does not call that a failure", async () => {
		const { input, app, connector } = setup();
		const before = process.listenerCount("SIGINT");
		const done = runDevProcesses(input);
		expect(process.listenerCount("SIGINT")).toBe(before + 1);
		process.emit("SIGINT");
		process.emit("SIGTERM");
		expect(app.kill).toHaveBeenCalledWith("SIGINT");
		expect(connector.kill).toHaveBeenCalledWith("SIGTERM");
		app.emit("exit", 130);
		connector.emit("exit", 0);
		expect(await done).toMatchObject({ exitCode: 0, interrupted: true });
		expect(process.listenerCount("SIGINT")).toBe(before);
	});

	it("rejects naming the program that is not installed, and stops the other", async () => {
		const { input, app, connector } = setup();
		const done = runDevProcesses(input);
		connector.emit("error", Object.assign(new Error("spawn cloudflared ENOENT"), { code: "ENOENT" }));
		await expect(done).rejects.toThrow("cloudflared is not installed or not on the PATH");
		expect(app.kill).toHaveBeenCalledWith("SIGTERM");
	});

	it("rejects with the reason for any other failure to start, once", async () => {
		const { input, app, connector } = setup();
		const done = runDevProcesses(input);
		app.emit("error", new Error("EACCES"));
		connector.emit("error", new Error("again"));
		await expect(done).rejects.toThrow("could not start pnpm: EACCES");
	});

	it("uses the platform's spawn when none is given", async () => {
		const app = child();
		const connector = child();
		spawnMock.mockReturnValueOnce(app).mockReturnValueOnce(connector);
		const { spawn: _unused, ...rest } = setup().input;
		const done = runDevProcesses(rest);
		app.emit("exit", 0);
		connector.emit("exit", 0);
		expect((await done).exitCode).toBe(0);
	});
});
