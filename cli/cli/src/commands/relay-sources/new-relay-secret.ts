import { randomBytes } from "node:crypto";

/**
 * A fresh signing secret for a vendor that lets the caller choose it: 32 random bytes as hex. A credential: it goes to
 * the provider that makes the webhook and to the Worker, and is never printed or logged.
 */
export function newRelaySecret(): string {
	return randomBytes(32).toString("hex");
}
