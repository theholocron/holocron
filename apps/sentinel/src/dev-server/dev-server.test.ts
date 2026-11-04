import { afterEach, describe, expect, it, vi } from "vitest";

import { startDevServer } from "./dev-server.js";
import type { DevServer } from "./dev-server.type.js";

const open: DevServer[] = [];
afterEach(async () => {
	for (const server of open.splice(0)) await server.close();
});

async function start(
	handle: (r: Request, env: { secret: string }) => Promise<Response>,
	over: { path?: string; log?: (l: string) => void } = {}
) {
	const server = await startDevServer({ handle, env: { secret: "S" }, port: 0, ...over });
	open.push(server);
	return server;
}

describe("startDevServer", () => {
	it("passes a POST's method, headers and body to the handler, with the env, and returns its response", async () => {
		const seen: Array<{ method: string; sig: string | null; body: string; env: unknown; url: string }> = [];
		const server = await start(async (request, env) => {
			seen.push({
				method: request.method,
				sig: request.headers.get("x-hub-signature-256"),
				body: await request.text(),
				env,
				url: request.url,
			});
			return new Response("accepted", { status: 202, headers: { "x-handled": "yes" } });
		});

		const reply = await fetch(server.url, {
			method: "POST",
			headers: { "x-hub-signature-256": "sha256=abc" },
			body: '{"a":1}',
		});

		expect(reply.status).toBe(202);
		expect(await reply.text()).toBe("accepted");
		expect(reply.headers.get("x-handled")).toBe("yes");
		expect(seen).toEqual([
			{ method: "POST", sig: "sha256=abc", body: '{"a":1}', env: { secret: "S" }, url: server.url },
		]);
	});

	it("serves only the handler's path, and a path of the caller's choosing", async () => {
		const handle = vi.fn(async () => new Response("ok"));
		const server = await start(handle);
		const elsewhere = await fetch(server.url.replace("/api/webhook", "/other"), { method: "POST", body: "x" });
		expect(elsewhere.status).toBe(404);
		expect(handle).not.toHaveBeenCalled();

		const custom = await start(handle, { path: "/hook" });
		expect(custom.url.endsWith("/hook")).toBe(true);
		expect((await fetch(custom.url, { method: "POST", body: "x" })).status).toBe(200);
	});

	it("lets the handler answer a method it does not take, and sends no body with a GET", async () => {
		const server = await start(async (request) =>
			request.method === "GET" ? new Response(String(request.body === null), { status: 405 }) : new Response("ok")
		);
		const reply = await fetch(server.url);
		expect(reply.status).toBe(405);
		expect(await reply.text()).toBe("true");
	});

	it("passes a header that arrives as a list, such as set-cookie, on whole", async () => {
		const server = await start(async (request) => new Response(request.headers.getSetCookie().join("|")));
		const { port } = new URL(server.url);
		const { request } = await import("node:http");
		const body = await new Promise<string>((resolve, reject) => {
			const req = request(
				{
					host: "127.0.0.1",
					port,
					path: "/api/webhook",
					method: "POST",
					headers: { "set-cookie": ["a=1", "b=2"] },
				},
				(res) => {
					let text = "";
					res.on("data", (c) => (text += c));
					res.on("end", () => resolve(text));
				}
			);
			req.on("error", reject);
			req.end("x");
		});
		expect(body).toBe("a=1|b=2");
	});

	it("answers 500 with nothing of the error when the handler throws", async () => {
		const server = await start(async () => {
			throw new Error("SECRET DETAIL");
		});
		const reply = await fetch(server.url, { method: "POST", body: "x" });
		expect(reply.status).toBe(500);
		expect(await reply.text()).toBe("Internal Server Error");
	});

	it("refuses a payload larger than a webhook can be", async () => {
		const handle = vi.fn(async () => new Response("ok"));
		const server = await start(handle);
		const big = new Uint8Array(27 * 1024 * 1024);
		const reply = await fetch(server.url, { method: "POST", body: big }).catch(() => undefined);
		// The server may close the connection once it has seen enough; either way the handler never ran.
		expect(reply === undefined || reply.status === 413).toBe(true);
		expect(handle).not.toHaveBeenCalled();
	});

	it("logs one line per request: method, path and status, never a header or a body", async () => {
		const lines: string[] = [];
		const server = await start(async () => new Response(null, { status: 204 }), { log: (l) => lines.push(l) });
		await fetch(server.url, { method: "POST", headers: { authorization: "TOKEN" }, body: "PAYLOAD" });
		await fetch(server.url.replace("/api/webhook", "/nope"));
		expect(lines).toEqual(["POST /api/webhook 204", "GET /nope 404"]);
		expect(lines.join("")).not.toMatch(/TOKEN|PAYLOAD/);
	});

	it("listens on the loopback address only", async () => {
		const server = await start(async () => new Response("ok"));
		expect(new URL(server.url).hostname).toBe("127.0.0.1");
	});
});
