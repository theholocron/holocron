/* eslint-disable n/no-unsupported-features/node-builtins -- this runs on Cloudflare Workers, which provide Web Crypto; the Node version range does not apply */
const toHex = (buffer: ArrayBuffer): string =>
	Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");

/** The hex HMAC-SHA256 of `text` under `secret`: the signature scheme Sentry (and many other services) use. */
export async function signHex(secret: string, text: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"]
	);
	return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
}

/** Whether two strings are equal, without stopping at the first difference. */
export function sameText(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}
