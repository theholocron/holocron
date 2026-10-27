import { postToDiscord } from "../discord/discord.js";
import type { Source } from "../sources/source.type.js";

/** The two secrets a source needs, by name: `COMLINK_SENTRY_SECRET` and `COMLINK_SENTRY_WEBHOOK`. */
export const bindingNames = (id: string) => ({
	secret: `COMLINK_${id.toUpperCase()}_SECRET`,
	webhook: `COMLINK_${id.toUpperCase()}_WEBHOOK`,
});

/**
 * The Worker's handler. A request to `/<source>` is checked as that source says (before anything in it is trusted),
 * turned into a Discord message and posted to that source's webhook. Each answer says what happened:
 * 405 not a POST, 404 no such source, 401 not from the service, 400 not JSON, 202 a delivery this source does not
 * carry (acknowledged so the service does not retry it), 500 the source has no webhook bound, 502 Discord refused.
 */
export function createRelay(sources: Source[]) {
	return async function relay(request: Request, env: Record<string, string | undefined>): Promise<Response> {
		if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
		const id = new URL(request.url).pathname.split("/").filter(Boolean)[0];
		const source = sources.find((s) => s.id === id);
		if (!source) return new Response("Not Found", { status: 404 });

		const names = bindingNames(source.id);
		const raw = await request.text();
		if (!(await source.verify(request.headers, raw, env[names.secret] ?? ""))) {
			return new Response("Unauthorized", { status: 401 });
		}
		let payload: unknown;
		try {
			payload = JSON.parse(raw);
		} catch {
			return new Response("Bad Request", { status: 400 });
		}
		const body = source.format(request.headers, payload);
		if (!body) return new Response(null, { status: 202 });
		const webhook = env[names.webhook];
		if (!webhook) return new Response("Not Configured", { status: 500 });
		return new Response(null, { status: (await postToDiscord(webhook, body)) ? 204 : 502 });
	};
}
