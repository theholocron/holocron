import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

import type { DevServer, DevServerInput } from "./dev-server.type.js";

const LOOPBACK = "127.0.0.1";
/** GitHub caps a webhook payload at 25 MB; anything larger is not one. */
const MAX_BODY = 26 * 1024 * 1024;

/** The request body, or `undefined` when it is larger than a webhook can be. */
async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of req) {
		size += (chunk as Buffer).length;
		if (size > MAX_BODY) return undefined;
		chunks.push(chunk as Buffer);
	}
	return Buffer.concat(chunks);
}

/**
 * Serves a `(Request, env) => Response` handler over HTTP on the loopback address, for a development instance behind
 * a tunnel: the same function the Vercel entry (`api/webhook.mjs`) calls, with the same web-standard `Request`. Only
 * the handler's own path is served. A request is logged as one line (method, path, status) and nothing else, so no
 * signature, token or payload reaches the terminal.
 */
export async function startDevServer<E>(input: DevServerInput<E>): Promise<DevServer> {
	const path = input.path ?? "/api/webhook";
	const log = input.log ?? (() => {});

	const server = createServer(async (req, res) => {
		const method = req.method as string;
		const url = new URL(req.url as string, `http://${LOOPBACK}`);
		const reply = (status: number, body: string | Buffer, headers: Record<string, string> = {}) => {
			log(`${method} ${url.pathname} ${status}`);
			res.writeHead(status, headers);
			res.end(body);
		};
		if (url.pathname !== path) return reply(404, "Not Found");

		const hasBody = method !== "GET" && method !== "HEAD";
		const body = hasBody ? await readBody(req) : undefined;
		if (hasBody && body === undefined) return reply(413, "Payload Too Large");

		const headers = new Headers();
		// rawHeaders is [name, value, name, value, ...], with a header sent twice kept as two entries.
		for (let i = 0; i < req.rawHeaders.length; i += 2) headers.append(req.rawHeaders[i]!, req.rawHeaders[i + 1]!);
		try {
			const response = await input.handle(
				new Request(`http://${req.headers.host}${req.url}`, { method, headers, ...(body ? { body } : {}) }),
				input.env
			);
			reply(response.status, Buffer.from(await response.arrayBuffer()), Object.fromEntries(response.headers));
		} catch {
			// A handler that throws is its own bug; the caller gets a bare 500 and nothing of the error.
			reply(500, "Internal Server Error");
		}
	});
	await new Promise<void>((resolve) => server.listen(input.port, LOOPBACK, resolve));

	const { port } = server.address() as AddressInfo;
	return {
		url: `http://${LOOPBACK}:${port}${path}`,
		close: () =>
			new Promise<void>((resolve) => {
				server.close(() => resolve());
				server.closeAllConnections();
			}),
	};
}
