import { createServer } from "node:net";

import { describe, expect, it } from "vitest";

import { waitForCode } from "./listener.js";

/** Starts the listener on any free port and resolves with that port and the pending code. */
function start(state: string, timeoutMs?: number) {
	let bound!: (port: number) => void;
	const port = new Promise<number>((r) => (bound = r));
	const code = waitForCode({ port: 0, state, ...(timeoutMs ? { timeoutMs } : {}), onListening: bound });
	return { port, code };
}

describe("waitForCode", () => {
	it("resolves with the code from a callback carrying the right state, and answers the browser", async () => {
		const { port, code } = start("s1");
		const res = await fetch(`http://127.0.0.1:${await port}/callback?code=abc&state=s1`);
		expect(res.status).toBe(200);
		expect(await res.text()).toContain("You are signed in");
		await expect(code).resolves.toBe("abc");
	});

	it("ignores a wrong state and other paths, and keeps waiting for the real one", async () => {
		const { port, code } = start("s2");
		const p = await port;
		expect((await fetch(`http://127.0.0.1:${p}/callback?code=evil&state=nope`)).status).toBe(400);
		expect((await fetch(`http://127.0.0.1:${p}/elsewhere`)).status).toBe(404);
		expect((await fetch(`http://127.0.0.1:${p}/callback?code=abc&state=s2`, { method: "POST" })).status).toBe(404);
		await fetch(`http://127.0.0.1:${p}/callback?code=good&state=s2`);
		await expect(code).resolves.toBe("good");
	});

	it("rejects when the provider reports an error or sends no code", async () => {
		// Collect the rejection as a value so it is handled before the browser's request is even made.
		const failure = (p: Promise<string>) =>
			p.then(
				() => undefined,
				(e: Error) => e.message
			);
		const denied = start("s3");
		const deniedMessage = failure(denied.code);
		await fetch(`http://127.0.0.1:${await denied.port}/callback?error=access_denied&state=s3`);
		expect(await deniedMessage).toMatch(/not approved \(access_denied\)/);
		const empty = start("s4");
		const emptyMessage = failure(empty.code);
		await fetch(`http://127.0.0.1:${await empty.port}/callback?state=s4`);
		expect(await emptyMessage).toMatch(/no code returned/);
	});

	it("gives up after the timeout", async () => {
		await expect(start("s5", 30).code).rejects.toThrow(/timed out/);
	});

	it("says so when the port is taken", async () => {
		const blocker = createServer();
		await new Promise<void>((r) => blocker.listen(0, "127.0.0.1", () => r()));
		const taken = (blocker.address() as { port: number }).port;
		await expect(waitForCode({ port: taken, state: "s6" })).rejects.toThrow(/already in use/);
		blocker.close();
	});

	it("passes any other listening error through", async () => {
		await expect(waitForCode({ port: -1, state: "s7" })).rejects.toBeDefined();
	});
});
