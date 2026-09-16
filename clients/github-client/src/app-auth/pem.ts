/**
 * PEM/DER handling for GitHub App private keys — Web Crypto only (no
 * `node:crypto`), so this runs unchanged on Cloudflare Workers (no
 * `nodejs_compat` needed) and in Node.
 *
 * GitHub hands out App private keys in PKCS#1 ("-----BEGIN RSA PRIVATE
 * KEY-----") by default; `SubtleCrypto.importKey("pkcs8", …)` only
 * accepts PKCS#8 ("-----BEGIN PRIVATE KEY-----"). `pkcs1ToPkcs8` wraps a
 * PKCS#1 `RSAPrivateKey` DER in the fixed `PrivateKeyInfo` DER structure
 * PKCS#8 requires — a fixed `AlgorithmIdentifier` prefix for
 * `rsaEncryption` (OID 1.2.840.113549.1.1.1) around the unchanged
 * PKCS#1 bytes. Verified against a real generated key pair: imported,
 * signed, and checked against `node:crypto`'s `verify()` on the
 * original key's public half.
 */

function pemToDer(pem: string): Uint8Array {
	const base64 = pem
		.replace(/-----BEGIN [^-]+-----/, "")
		.replace(/-----END [^-]+-----/, "")
		.replace(/\s/g, "");
	return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function concat(...arrays: Uint8Array[]): Uint8Array {
	const total = arrays.reduce((sum, a) => sum + a.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const a of arrays) {
		out.set(a, offset);
		offset += a.length;
	}
	return out;
}

function encodeDerLength(len: number): Uint8Array {
	// Short-form DER length (single byte, len < 128) — real RSA key sizes
	// (2048-bit and up) always produce a long-form length at every call
	// site here (the PKCS#1 octet string, the outer PKCS#8 SEQUENCE), so
	// this branch isn't reachable through importRsaPrivateKey with a
	// realistic key; kept because it's the other half of a well-defined,
	// simple encoding rule (ITU-T X.690 §8.1.3), not something specific
	// to RSA.
	/* istanbul ignore next -- see comment above */
	if (len < 0x80) return new Uint8Array([len]);
	const bytes: number[] = [];
	let n = len;
	while (n > 0) {
		bytes.unshift(n & 0xff);
		n >>= 8;
	}
	return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function derEncode(tag: number, content: Uint8Array): Uint8Array {
	return concat(new Uint8Array([tag]), encodeDerLength(content.length), content);
}

/** SEQUENCE { OID rsaEncryption, NULL } — the fixed PKCS#8 AlgorithmIdentifier for RSA. */
const RSA_ALGORITHM_IDENTIFIER = new Uint8Array([
	0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
]);

function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
	const version = new Uint8Array([0x02, 0x01, 0x00]); // INTEGER 0
	const octetString = derEncode(0x04, pkcs1); // OCTET STRING wrapping the PKCS#1 bytes unchanged
	const body = concat(version, RSA_ALGORITHM_IDENTIFIER, octetString);
	return derEncode(0x30, body); // SEQUENCE (PrivateKeyInfo)
}

/** Imports a PEM-encoded RSA private key — PKCS#1 or PKCS#8, either works — for RS256 signing. */
export async function importRsaPrivateKey(pem: string): Promise<CryptoKey> {
	const der = pemToDer(pem);
	const isPkcs1 = pem.includes("BEGIN RSA PRIVATE KEY");
	// .slice() normalizes to a Uint8Array<ArrayBuffer> — importKey's BufferSource
	// param rejects the wider Uint8Array<ArrayBufferLike> TS otherwise infers here.
	const pkcs8Der = (isPkcs1 ? pkcs1ToPkcs8(der) : der).slice();
	return crypto.subtle.importKey("pkcs8", pkcs8Der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

/** Base64url (no padding) — the encoding both JWT segments and the signature use. */
export function base64UrlEncode(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
