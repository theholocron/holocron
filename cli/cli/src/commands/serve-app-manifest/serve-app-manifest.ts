import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import type { AppManifestServer, ServeAppManifestInput } from "./serve-app-manifest.type.js";

const LOOPBACK = "127.0.0.1";
const FIVE_MINUTES = 5 * 60 * 1000;

/**
 * A one-shot server on a random loopback port: `/` shows the page that posts the manifest to GitHub, `/callback` takes
 * the one-time code GitHub redirects back with. The code is only accepted with the `state` it was started with, and a
 * request that does not name this server's own address (a DNS-rebinding page) is refused.
 */
export async function serveAppManifest(input: ServeAppManifestInput): Promise<AppManifestServer> {
	let resolveCode!: (code: string) => void;
	let rejectCode!: (err: Error) => void;
	const code = new Promise<string>((resolve, reject) => {
		resolveCode = resolve;
		rejectCode = reject;
	});
	// A rejected promise nobody awaits (the run stopped first) must not take the process down.
	code.catch(() => {});

	const server = createServer((req, res) => {
		const reply = (status: number, type: string, body: string) => {
			res.writeHead(status, { "content-type": `${type}; charset=utf-8`, "cache-control": "no-store" });
			res.end(body);
		};
		const { port } = server.address() as AddressInfo;
		if (req.headers.host !== `${LOOPBACK}:${port}`) return reply(403, "text/plain", "forbidden");
		const url = new URL(req.url as string, `http://${LOOPBACK}:${port}`);
		if (url.pathname === "/") return reply(200, "text/html", input.page(`http://${LOOPBACK}:${port}/callback`));
		if (url.pathname === "/callback") {
			const got = url.searchParams.get("code");
			if (url.searchParams.get("state") !== input.state || !got) return reply(400, "text/plain", "bad request");
			reply(200, "text/plain", "Done. You can close this tab and go back to the terminal.");
			resolveCode(got);
			return;
		}
		reply(404, "text/plain", "not found");
	});
	await new Promise<void>((resolve) => server.listen(0, LOOPBACK, resolve));

	const timer = setTimeout(
		() => rejectCode(new Error("timed out waiting for GitHub: the App was not created")),
		input.timeoutMs ?? FIVE_MINUTES
	);
	const close = () => {
		clearTimeout(timer);
		server.close();
		server.closeAllConnections();
	};
	return { url: `http://${LOOPBACK}:${(server.address() as AddressInfo).port}/`, code, close };
}
