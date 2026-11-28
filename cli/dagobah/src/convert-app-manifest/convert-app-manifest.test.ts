import { describe, expect, it, vi } from "vitest";

import { convertAppManifest } from "./convert-app-manifest.js";

const answer = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

const created = {
	id: 42,
	slug: "the-app",
	html_url: "https://github.com/apps/the-app",
	pem: "PEM",
	webhook_secret: "WS",
	client_secret: "CS",
};

describe("convertAppManifest", () => {
	it("posts the code with no token and returns only what is kept", async () => {
		const fetchImpl = answer(201, created);
		const app = await convertAppManifest("a/b", fetchImpl as never);
		expect(app).toEqual({
			id: 42,
			slug: "the-app",
			htmlUrl: "https://github.com/apps/the-app",
			pem: "PEM",
			webhookSecret: "WS",
		});
		const [url, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
		expect(url).toBe("https://api.github.com/app-manifests/a%2Fb/conversions");
		expect(init.method).toBe("POST");
		expect(Object.keys(init.headers as object)).not.toContain("authorization");
	});

	it("names the status and never the body when GitHub refuses", async () => {
		const err = await convertAppManifest("x", answer(404, { message: "SECRET-BODY" }) as never).catch(
			(e: unknown) => e
		);
		expect((err as Error).message).toBe("GitHub did not convert the manifest (HTTP 404)");
	});

	it("refuses an answer that lacks the App id, key or secret", async () => {
		const { pem: _pem, ...partial } = created;
		const err = await convertAppManifest("x", answer(201, partial) as never).catch((e: unknown) => e);
		expect((err as Error).message).toMatch(/did not hold/);
	});

	it("uses the global fetch by default", async () => {
		const spy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(JSON.stringify(created), { status: 201 }));
		try {
			expect((await convertAppManifest("x")).id).toBe(42);
		} finally {
			spy.mockRestore();
		}
	});
});
