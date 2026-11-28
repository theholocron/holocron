import { ReadableStream } from "node:stream/web";

import { describe, expect, it, vi } from "vitest";

import { fetchAvatarBytes, MAX_AVATAR_REDIRECTS } from "./fetch-avatar.js";

const MAX = 16;
const tooBig = () => new Error("too big");
const redirect = (to: string | null, status = 302) =>
	new Response(null, { status, ...(to === null ? {} : { headers: { location: to } }) });

/** A fetch that answers each call with the next response, and records what it was asked. */
const sequence = (...responses: Response[]) => {
	const queue = [...responses];
	return vi.fn(async () => queue.shift()!) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
};

const run = (fetchImpl: typeof fetch, url = "https://x.test/a.png") =>
	fetchAvatarBytes(url, fetchImpl, MAX, 1000, tooBig);

const failure = async (fetchImpl: typeof fetch, url?: string) =>
	((await run(fetchImpl, url).catch((e: unknown) => e)) as Error).message;

describe("fetchAvatarBytes redirects", () => {
	it("asks for a redirect to be returned, not followed, and sends no headers", async () => {
		const fetchImpl = sequence(new Response("ok"));
		await run(fetchImpl);
		const init = fetchImpl.mock.calls[0]![1] as RequestInit;
		expect(init.redirect).toBe("manual");
		expect(init.headers).toBeUndefined();
	});

	it("follows a redirect to another https host, resolving a relative Location", async () => {
		const fetchImpl = sequence(
			redirect("https://cdn.example.com/b.png", 301),
			redirect("/c.png", 307),
			new Response("ok")
		);
		expect((await run(fetchImpl)).toString()).toBe("ok");
		expect(fetchImpl.mock.calls.map((c: unknown[]) => c[0])).toEqual([
			"https://x.test/a.png",
			"https://cdn.example.com/b.png",
			"https://cdn.example.com/c.png",
		]);
	});

	it("gives up after too many hops", async () => {
		const hops = Array.from({ length: MAX_AVATAR_REDIRECTS + 1 }, (_, i) => redirect(`/${i}`));
		const fetchImpl = sequence(...hops);
		expect(await failure(fetchImpl)).toBe(`it redirected more than ${MAX_AVATAR_REDIRECTS} times`);
		expect(fetchImpl).toHaveBeenCalledTimes(MAX_AVATAR_REDIRECTS + 1);
	});

	it("refuses a redirect to http, to credentials, to a private host, to nowhere or to a non-URL", async () => {
		expect(await failure(sequence(redirect("http://cdn.example.com/a.png")))).toBe(
			"it redirected to a http address, not https"
		);
		expect(await failure(sequence(redirect("ftp://cdn.example.com/a.png")))).toBe(
			"it redirected to a ftp address, not https"
		);
		expect(await failure(sequence(redirect("https://u:p@cdn.example.com/a.png")))).toBe(
			"it redirected to an address with credentials in it"
		);
		expect(await failure(sequence(redirect("https://user@cdn.example.com/a.png")))).toBe(
			"it redirected to an address with credentials in it"
		);
		for (const to of [
			"https://169.254.169.254/latest",
			"https://localhost/a",
			"https://[::1]/a",
			"https://10.0.0.5/a",
		]) {
			const fetchImpl = sequence(redirect(to), new Response("secret"));
			expect(await failure(fetchImpl)).toBe("it redirected to a private or local address");
			expect(fetchImpl).toHaveBeenCalledTimes(1);
		}
		expect(await failure(sequence(redirect(null)))).toBe("it redirected without saying where");
		expect(await failure(sequence(redirect("https://")))).toBe("it redirected to an address that is not a URL");
	});

	it("does not message the secret of the redirect target", async () => {
		const message = await failure(sequence(redirect("https://u:SECRET@cdn.example.com/a.png?sig=SECRET")));
		expect(message).not.toContain("SECRET");
	});
});

describe("fetchAvatarBytes body", () => {
	it("refuses a status that is not ok", async () => {
		expect(await failure(sequence(new Response("no", { status: 404 })))).toBe("fetching it answered 404");
	});

	it("refuses a declared length over the cap without reading the body", async () => {
		const res = new Response("x", { headers: { "content-length": String(MAX + 1) } });
		expect(await failure(sequence(res))).toBe("too big");
	});

	it("refuses a declared length over the cap when there is no body", async () => {
		const res = new Response(null, { headers: { "content-length": String(MAX + 1) } });
		expect(await failure(sequence(res))).toBe("too big");
	});

	it("reads a body up to the cap, across chunks", async () => {
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array(8).fill(1));
				controller.enqueue(new Uint8Array(8).fill(2));
				controller.close();
			},
		});
		expect((await run(sequence(new Response(body)))).length).toBe(16);
	});

	it("reads a response with no body as empty", async () => {
		expect((await run(sequence(new Response(null, { status: 200 })))).length).toBe(0);
	});

	it("stops reading an endless body at the cap and cancels it", async () => {
		let pulls = 0;
		let cancelled = false;
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulls++;
				controller.enqueue(new Uint8Array(10));
			},
			cancel() {
				cancelled = true;
			},
		});
		expect(await failure(sequence(new Response(body)))).toBe("too big");
		expect(cancelled).toBe(true);
		expect(pulls).toBeLessThan(10);
	});
});
