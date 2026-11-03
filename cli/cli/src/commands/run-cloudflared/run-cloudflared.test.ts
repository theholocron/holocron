import type { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

// Nothing here may start a real cloudflared.
const spawnMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawn: spawnMock }));

import { runCloudflared } from "./run-cloudflared.js";

function fakeSpawn() {
	const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
	const spawnImpl = vi.fn(() => child);
	return {
		child,
		spawnImpl: spawnImpl as unknown as typeof spawn,
		calls: spawnImpl.mock.calls as unknown as Array<
			[string, string[], { env: Record<string, string>; stdio: string }]
		>,
	};
}

describe("runCloudflared", () => {
	it("starts the connector with the token in its environment and not in its arguments", async () => {
		const { child, spawnImpl, calls } = fakeSpawn();
		const done = runCloudflared("SECRET-TOKEN", spawnImpl);
		child.emit("exit", 0);

		expect(await done).toBe(0);
		const [command, args, options] = calls[0]!;
		expect(command).toBe("cloudflared");
		expect(args.join(" ")).not.toContain("SECRET-TOKEN");
		expect(options.env["TUNNEL_TOKEN"]).toBe("SECRET-TOKEN");
		expect(options.stdio).toBe("inherit");
	});

	it("resolves with the connector's exit status, and 1 when it was killed by a signal", async () => {
		const a = fakeSpawn();
		const first = runCloudflared("t", a.spawnImpl);
		a.child.emit("exit", 3);
		expect(await first).toBe(3);

		const b = fakeSpawn();
		const second = runCloudflared("t", b.spawnImpl);
		b.child.emit("exit", null);
		expect(await second).toBe(1);
	});

	it("passes Ctrl-C and a termination signal on to the connector, and stops listening afterwards", async () => {
		const { child, spawnImpl } = fakeSpawn();
		const before = process.listenerCount("SIGINT");
		const done = runCloudflared("t", spawnImpl);
		expect(process.listenerCount("SIGINT")).toBe(before + 1);
		process.emit("SIGINT");
		process.emit("SIGTERM");
		expect(child.kill).toHaveBeenCalledWith("SIGINT");
		expect(child.kill).toHaveBeenCalledWith("SIGTERM");
		child.emit("exit", 0);
		await done;
		expect(process.listenerCount("SIGINT")).toBe(before);
	});

	it("says to install cloudflared when it is not there", async () => {
		const { child, spawnImpl } = fakeSpawn();
		const done = runCloudflared("t", spawnImpl);
		child.emit("error", Object.assign(new Error("spawn cloudflared ENOENT"), { code: "ENOENT" }));
		await expect(done).rejects.toThrow(/brew install cloudflared/);
	});

	it("reports any other failure to start it", async () => {
		const { child, spawnImpl } = fakeSpawn();
		const done = runCloudflared("t", spawnImpl);
		child.emit("error", new Error("EACCES"));
		await expect(done).rejects.toThrow(/could not start cloudflared: EACCES/);
	});

	it("uses the platform's spawn when none is given", async () => {
		const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
		spawnMock.mockReturnValueOnce(child);
		const done = runCloudflared("t");
		child.emit("exit", 0);
		expect(await done).toBe(0);
	});
});
