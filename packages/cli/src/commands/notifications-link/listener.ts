import { createServer } from "node:http";

const PAGE = (title: string, body: string) =>
	`<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px system-ui;margin:3rem auto;max-width:32rem"><h1>${title}</h1><p>${body}</p>`;

/**
 * Listens once on this machine for the browser coming back from the provider, and resolves with the `code` it
 * carries. It accepts nothing but a `/callback` whose `state` is the one that was handed out, answers every
 * other request with 404, stops after the first good answer, and gives up after `timeoutMs`.
 * Bound to the loopback address only, so nothing else on the network can reach it.
 */
export function waitForCode(input: {
	port: number;
	state: string;
	timeoutMs?: number;
	/** Called with the port actually bound (differs from `port` only when that is 0). */
	onListening?: (port: number) => void;
}): Promise<string> {
	return new Promise((resolve, reject) => {
		let done = false;
		const finish = (fn: () => void) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			server.close();
			server.closeAllConnections();
			fn();
		};
		const server = createServer((req, res) => {
			const url = new URL(req.url ?? "/", "http://localhost");
			if (req.method !== "GET" || url.pathname !== "/callback") {
				res.writeHead(404).end();
				return;
			}
			const reply = (status: number, title: string, body: string) => {
				res.writeHead(status, { "content-type": "text/html; charset=utf-8" }).end(PAGE(title, body));
			};
			if (url.searchParams.get("state") !== input.state) {
				// Not ours (a stale tab, or someone else posting at the port): say no and keep waiting for the real one.
				reply(400, "Wrong sign-in", "This link does not belong to the running command. Start it again.");
				return;
			}
			const error = url.searchParams.get("error");
			const code = url.searchParams.get("code");
			if (error || !code) {
				reply(400, "Sign-in was not approved", "You can close this window.");
				finish(() => reject(new Error(`the sign-in was not approved (${error ?? "no code returned"})`)));
				return;
			}
			reply(200, "You are signed in", "You can close this window and go back to the terminal.");
			finish(() => resolve(code));
		});
		const timer = setTimeout(
			() => finish(() => reject(new Error("timed out waiting for the sign-in to come back"))),
			input.timeoutMs ?? 300_000
		);
		server.once("error", (err: NodeJS.ErrnoException) =>
			finish(() =>
				reject(
					err.code === "EADDRINUSE"
						? new Error(
								`port ${input.port} is already in use; stop what is using it or set \`layout.links.localPort\``
							)
						: err
				)
			)
		);
		server.listen(input.port, "127.0.0.1", () => {
			const address = server.address();
			input.onListening?.(typeof address === "object" && address ? address.port : input.port);
		});
	});
}
