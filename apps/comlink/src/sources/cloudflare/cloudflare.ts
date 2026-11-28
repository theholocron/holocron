import { clip, message } from "../../discord/discord.js";
import { sameText } from "../../hmac/hmac.js";
import { MalformedDelivery, type Source } from "../source.type.js";

interface CloudflareNotification {
	name?: unknown;
	text?: unknown;
	ts?: unknown;
	alert_type?: unknown;
	alert_event?: unknown;
	policy_name?: unknown;
}

const RED = 0xe5484d;
const GREEN = 0x30a46c;

/**
 * Cloudflare (notification webhooks). Cloudflare does not sign the body: it sends the secret entered on the webhook,
 * as is, in the `cf-webhook-auth` header of every request, so verification is a constant-time comparison of that header
 * with the bound secret and the body plays no part in it. Every notification carries a `text`; the alert's
 * kind is `alert_type` and a resolved alert says `ALERT_STATE_EVENT_END` in `alert_event`. The `data` object differs
 * by alert type and is not read, so nothing in it is ever shown.
 */
export const cloudflare: Source = {
	id: "cloudflare",

	async verify(headers, _raw, secret) {
		const sent = headers.get("cf-webhook-auth");
		if (!secret || !sent) return false;
		return sameText(sent, secret);
	},

	format(_headers, payload) {
		if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
			throw new MalformedDelivery("notification is not an object");
		}
		const n = payload as CloudflareNotification;
		if (typeof n.text !== "string" || !n.text) throw new MalformedDelivery("notification without text");
		const name =
			typeof n.name === "string" && n.name ? n.name : typeof n.policy_name === "string" ? n.policy_name : "";
		const ended = n.alert_event === "ALERT_STATE_EVENT_END";
		const fields: Array<{ name: string; value: string; inline: boolean }> = [];
		if (typeof n.alert_type === "string" && n.alert_type) {
			fields.push({ name: "Alert", value: clip(n.alert_type, 1024), inline: true });
		}
		if (typeof n.alert_event === "string" && n.alert_event) {
			fields.push({ name: "State", value: ended ? "resolved" : clip(n.alert_event, 1024), inline: true });
		}
		const time = typeof n.ts === "number" && Number.isFinite(n.ts) ? new Date(n.ts * 1000) : undefined;
		return message("Cloudflare", {
			title: clip(name || "Cloudflare notification", 256),
			description: clip(n.text, 4096),
			color: ended ? GREEN : RED,
			fields,
			...(time && !Number.isNaN(time.getTime()) ? { timestamp: time.toISOString() } : {}),
		});
	},
};
