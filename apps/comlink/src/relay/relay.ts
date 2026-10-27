import { postToDiscord } from "../discord/discord.js";
import { MalformedDelivery, type Source } from "../sources/source.type.js";

/** The two secrets a source needs, by name: `COMLINK_SENTRY_SECRET` and `COMLINK_SENTRY_WEBHOOK`. */
export const bindingNames = (id: string) => ({
	secret: `COMLINK_${id.toUpperCase()}_SECRET`,
	webhook: `COMLINK_${id.toUpperCase()}_WEBHOOK`,
});

/** The largest body read: a service's alert is a few KB, so anything bigger is not worth hashing. */
export const MAX_BODY_BYTES = 256 * 1024;

/** The body as text, or null once it passes the cap: reading stops there, so an oversized body is never held in full. */
async function readBounded(request: Request): Promise<string | null> {
	if (!request.body) return "";
	const reader = request.body.getReader();
	const decoder = new TextDecoder();
	let text = "";
	let bytes = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		bytes += value.byteLength;
		if (bytes > MAX_BODY_BYTES) {
			await reader.cancel();
			return null;
		}
		text += decoder.decode(value, { stream: true });
	}
	return text + decoder.decode();
}

/**
 * The Worker's handler. A request to `/<source>` is checked as that source says (before anything in it is trusted),
 * turned into a Discord message and posted to that source's webhook. Each answer says what happened:
 * 405 not a POST, 404 no such source, 413 a body over the size cap, 401 not from the service, 400 not JSON, 202 a delivery this source does not
 * carry (acknowledged so the service does not retry it), 422 a delivery the source cannot read,
 * 500 the source has no webhook bound, 502 Discord refused or did not answer.
 */
export function createRelay(sources: Source[]) {
	return async function relay(request: Request, env: Record<string, string | undefined>): Promise<Response> {
		if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
		const id = new URL(request.url).pathname.split("/").filter(Boolean)[0];
		const source = sources.find((s) => s.id === id);
		if (!source) return new Response("Not Found", { status: 404 });

		const names = bindingNames(source.id);
		if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
			return new Response("Payload Too Large", { status: 413 });
		}
		const raw = await readBounded(request);
		if (raw === null) return new Response("Payload Too Large", { status: 413 });
		if (!(await source.verify(request.headers, raw, env[names.secret] ?? ""))) {
			return new Response("Unauthorized", { status: 401 });
		}
		let payload: unknown;
		try {
			payload = JSON.parse(raw);
		} catch {
			return new Response("Bad Request", { status: 400 });
		}
		let body;
		try {
			body = source.format(request.headers, payload);
		} catch (error) {
			if (error instanceof MalformedDelivery) return new Response("Unprocessable Entity", { status: 422 });
			throw error;
		}
		if (!body) return new Response(null, { status: 202 });
		const webhook = env[names.webhook];
		if (!webhook) return new Response("Not Configured", { status: 500 });
		return new Response(null, { status: (await postToDiscord(webhook, body)) ? 204 : 502 });
	};
}
