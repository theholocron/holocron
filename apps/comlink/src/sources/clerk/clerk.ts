/* eslint-disable n/no-unsupported-features/node-builtins -- this runs on Cloudflare Workers, which provide Web Crypto; the Node version range does not apply */
import { clip, message } from "../../discord/discord.js";
import { sameText } from "../../hmac/hmac.js";
import { MalformedDelivery, type Source } from "../source.type.js";

/** How far a delivery's timestamp may be from now, in seconds, before it is refused as a replay (Svix's own default). */
export const TOLERANCE_SECONDS = 300;

/** The events that are carried (accounts and who belongs to an organization), with the colour and words of the embed. */
const EVENTS: Record<string, { color: number; label: string }> = {
	"user.created": { color: 0x30a46c, label: "User created" },
	"user.deleted": { color: 0xe5484d, label: "User deleted" },
	"organization.created": { color: 0x30a46c, label: "Organization created" },
	"organization.deleted": { color: 0xe5484d, label: "Organization deleted" },
	"organizationMembership.created": { color: 0x3e63dd, label: "Member added" },
	"organizationMembership.deleted": { color: 0xf5a623, label: "Member removed" },
};

interface ClerkDelivery {
	type?: unknown;
	timestamp?: unknown;
	data?: {
		id?: unknown;
		first_name?: unknown;
		last_name?: unknown;
		username?: unknown;
		name?: unknown;
		slug?: unknown;
		role?: unknown;
		organization?: { name?: unknown; slug?: unknown };
		public_user_data?: { first_name?: unknown; last_name?: unknown; identifier?: unknown; user_id?: unknown };
	};
}

/** The raw bytes of a standard base64 string, or null when it is not one. */
function fromBase64(value: string): Uint8Array<ArrayBuffer> | null {
	try {
		const binary = atob(value);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		return bytes;
	} catch {
		return null;
	}
}

/** The base64 HMAC-SHA256 of `value` under the key bytes. */
async function signBase64(key: Uint8Array<ArrayBuffer>, value: string): Promise<string> {
	const imported = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const mac = new Uint8Array(await crypto.subtle.sign("HMAC", imported, new TextEncoder().encode(value)));
	let binary = "";
	for (const b of mac) binary += String.fromCharCode(b);
	return btoa(binary);
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** A person's name, else their username or identifier. */
function person(first: unknown, last: unknown, fallback: unknown): string {
	return [text(first), text(last)].filter(Boolean).join(" ") || text(fallback);
}

/**
 * Clerk (webhooks are delivered by Svix). A delivery carries `svix-id`, `svix-timestamp` (seconds) and
 * `svix-signature`: one or more space-separated `v1,<base64>` entries, each the HMAC-SHA256 of
 * `<id>.<timestamp>.<body>` under the key, which is the base64 part of the `whsec_...` signing secret. The body is
 * checked exactly as received; a timestamp more than five minutes from now is refused, so a captured delivery cannot be
 * replayed. Only account and organization-membership events are carried; any other type is acknowledged and dropped.
 */
export const clerk: Source = {
	id: "clerk",

	async verify(headers, raw, secret) {
		const id = headers.get("svix-id");
		const timestamp = headers.get("svix-timestamp");
		const signatures = headers.get("svix-signature");
		if (!secret || !id || !timestamp || !signatures) return false;
		if (!/^\d+$/.test(timestamp)) return false;
		if (Math.abs(Date.now() / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) return false;
		const key = fromBase64(secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret);
		if (!key || key.length === 0) return false;
		const expected = await signBase64(key, `${id}.${timestamp}.${raw}`);
		let matched = false;
		for (const entry of signatures.split(" ")) {
			const [version, value] = entry.split(",");
			// every v1 entry is compared, so the time taken does not say which one matched
			if (version === "v1" && value && sameText(expected, value)) matched = true;
		}
		return matched;
	},

	format(_headers, payload) {
		const delivery = payload as ClerkDelivery | null;
		if (!delivery || typeof delivery.type !== "string") throw new MalformedDelivery("delivery without a type");
		const event = EVENTS[delivery.type];
		if (!event) return null;
		const data = delivery.data;
		if (!data || typeof data !== "object") throw new MalformedDelivery(`${delivery.type} without data`);
		const fields: Array<{ name: string; value: string; inline: boolean }> = [];
		const add = (name: string, value: string) => {
			if (value) fields.push({ name, value: clip(value, 1024), inline: true });
		};
		let subject: string;
		if (delivery.type.startsWith("user.")) {
			subject = person(data.first_name, data.last_name, data.username);
			add("User", subject);
			add("Id", text(data.id));
		} else if (delivery.type.startsWith("organizationMembership.")) {
			const who = data.public_user_data;
			subject = person(who?.first_name, who?.last_name, who?.identifier);
			add("Member", subject);
			add("Organization", text(data.organization?.name) || text(data.organization?.slug));
			add("Role", text(data.role));
		} else {
			subject = text(data.name) || text(data.slug);
			add("Organization", subject);
			add("Id", text(data.id));
		}
		return message("Clerk", {
			title: clip(subject ? `${event.label}: ${subject}` : event.label, 256),
			color: event.color,
			fields,
			...(typeof delivery.timestamp === "number"
				? { timestamp: new Date(delivery.timestamp).toISOString() }
				: {}),
		});
	},
};
