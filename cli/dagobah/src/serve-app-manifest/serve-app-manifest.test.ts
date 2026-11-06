import { request } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { serveAppManifest } from "./serve-app-manifest.js";

const open: Array<{ close: () => void }> = [];
afterEach(() => {
	for (const server of open.splice(0)) server.close();
});

const start = async (timeoutMs?: number) => {
	const server = await serveAppManifest({ state: "s1", page: (redirect) => `<p>${redirect}</p>`, timeoutMs });
	open.push(server);
	return server;
};

describe("serveAppManifest", () => {
	it("serves the page with the redirect URL on its own port", async () => {
		const server = await start();
		const body = await (await fetch(server.url)).text();
		expect(body).toBe(`<p>${server.url}callback</p>`);
	});

	it("resolves the code from a callback that carries the state", async () => {
		const server = await start();
		const reply = await fetch(`${server.url}callback?code=abc&state=s1`);
		expect(reply.status).toBe(200);
		await expect(server.code).resolves.toBe("abc");
	});

	it("refuses a callback with the wrong state or no code, and keeps waiting", async () => {
		const server = await start();
		expect((await fetch(`${server.url}callback?code=abc&state=other`)).status).toBe(400);
		expect((await fetch(`${server.url}callback?state=s1`)).status).toBe(400);
		expect((await fetch(`${server.url}callback?code=abc&state=s1`)).status).toBe(200);
		await expect(server.code).resolves.toBe("abc");
	});

	it("answers 404 for any other path", async () => {
		const server = await start();
		expect((await fetch(`${server.url}elsewhere`)).status).toBe(404);
	});

	it("refuses a request that does not name its own address", async () => {
		const server = await start();
		const { port } = new URL(server.url);
		const status = await new Promise<number>((resolve, reject) => {
			const req = request({ host: "127.0.0.1", port, path: "/", headers: { host: "evil.example" } }, (res) => {
				res.resume();
				resolve(res.statusCode ?? 0);
			});
			req.on("error", reject);
			req.end();
		});
		expect(status).toBe(403);
	});

	it("rejects when GitHub never answers, and can be closed twice", async () => {
		const server = await start(10);
		await expect(server.code).rejects.toThrow(/timed out/);
		expect(() => {
			server.close();
			server.close();
		}).not.toThrow();
	});

	it("uses five minutes when no timeout is given", async () => {
		const server = await start();
		const pending = Symbol("pending");
		expect(await Promise.race([server.code, Promise.resolve(pending)])).toBe(pending);
	});
});
