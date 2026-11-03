/**
 * Download an avatar over `https://`, following redirects one hop at a time and reading the body only up to a cap.
 */

import { isPrivateHost } from "./private-host.js";

/** How many redirects an avatar download follows before it gives up. */
export const MAX_AVATAR_REDIRECTS = 3;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Fetch `url` with `fetchImpl`, never letting it follow redirects itself (`redirect: "manual"`). A redirect is followed
 * only to an `https://` address with no credentials in it that is not a private or loopback host, and at most
 * {@link MAX_AVATAR_REDIRECTS} times. The request carries no headers, so nothing is forwarded to the next host. The body
 * is read as a stream and abandoned the moment it passes `maxBytes`, so an endless response never fills memory.
 * `tooBig` builds the error for an oversized body.
 */
export async function fetchAvatarBytes(
	url: string,
	fetchImpl: typeof fetch,
	maxBytes: number,
	timeoutMs: number,
	tooBig: () => Error
): Promise<Buffer> {
	const signal = AbortSignal.timeout(timeoutMs);
	let current = url;
	for (let hop = 0; ; hop++) {
		const res = await fetchImpl(current, { signal, redirect: "manual" });
		if (!REDIRECT_STATUSES.has(res.status)) return readCapped(res, maxBytes, tooBig);
		await res.body?.cancel();
		if (hop === MAX_AVATAR_REDIRECTS) throw new Error(`it redirected more than ${MAX_AVATAR_REDIRECTS} times`);
		current = redirectTarget(current, res.headers.get("location"));
	}
}

function redirectTarget(from: string, location: string | null): string {
	if (!location) throw new Error("it redirected without saying where");
	let next: URL;
	try {
		next = new URL(location, from);
	} catch {
		throw new Error("it redirected to an address that is not a URL");
	}
	if (next.protocol !== "https:")
		throw new Error(`it redirected to a ${next.protocol.slice(0, -1)} address, not https`);
	if (next.username || next.password) throw new Error("it redirected to an address with credentials in it");
	if (isPrivateHost(next.hostname)) throw new Error("it redirected to a private or local address");
	return next.href;
}

async function readCapped(res: Response, maxBytes: number, tooBig: () => Error): Promise<Buffer> {
	if (!res.ok) throw new Error(`fetching it answered ${res.status}`);
	if (Number(res.headers.get("content-length")) > maxBytes) {
		await res.body?.cancel();
		throw tooBig();
	}
	if (!res.body) return Buffer.alloc(0);
	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel();
			throw tooBig();
		}
		chunks.push(value);
	}
	return Buffer.concat(chunks);
}
