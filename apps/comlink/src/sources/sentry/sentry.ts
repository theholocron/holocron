import { clip, message } from "../../discord/discord.js";
import { sameText, signHex } from "../../hmac/hmac.js";
import { MalformedDelivery, type Source } from "../source.type.js";

const COLORS: Record<string, number> = {
	fatal: 0x8b0000,
	error: 0xe5484d,
	warning: 0xf5a524,
	info: 0x3e63dd,
	debug: 0x889096,
};

interface SentryEvent {
	title?: string;
	message?: string;
	culprit?: string;
	level?: string;
	web_url?: string;
	datetime?: string;
	environment?: string;
	project_name?: string;
	project?: string | number;
	tags?: unknown;
}

interface SentryAlert {
	data?: { event?: SentryEvent; triggered_rule?: string };
}

function tagValue(event: SentryEvent, name: string): string | undefined {
	const tags = Array.isArray(event.tags) ? event.tags : [];
	for (const tag of tags) {
		if (Array.isArray(tag) && tag[0] === name) return String(tag[1]);
		if (tag && typeof tag === "object" && !Array.isArray(tag)) {
			const { key, value } = tag as { key?: unknown; value?: unknown };
			if (key === name && value !== undefined && value !== null) return String(value);
		}
	}
	return undefined;
}

/**
 * Sentry (the integration platform). A delivery is signed with `Sentry-Hook-Signature`, a hex HMAC-SHA256 of the body
 * under the integration's client secret, checked against the body exactly as received. A re-serialised form is never tried: it can
 * parse differently from what was signed. Only issue alerts (`event_alert`) are carried.
 */
export const sentry: Source = {
	id: "sentry",

	async verify(headers, raw, secret) {
		const signature = headers.get("sentry-hook-signature");
		if (!secret || !signature) return false;
		return sameText(await signHex(secret, raw), signature);
	},

	format(headers, payload) {
		if (headers.get("sentry-hook-resource") !== "event_alert") return null;
		const event = (payload as SentryAlert | null)?.data?.event;
		if (!event) throw new MalformedDelivery("event_alert without data.event");
		const level = String(event.level ?? "error").toLowerCase();
		const fields: Array<{ name: string; value: string; inline: boolean }> = [];
		const environment = event.environment ?? tagValue(event, "environment");
		if (environment) fields.push({ name: "Environment", value: clip(environment, 1024), inline: true });
		fields.push({ name: "Level", value: level, inline: true });
		const project = event.project_name ?? tagValue(event, "project") ?? event.project;
		if (project) fields.push({ name: "Project", value: clip(project, 1024), inline: true });
		const rule = (payload as SentryAlert).data?.triggered_rule;
		if (rule) fields.push({ name: "Rule", value: clip(rule, 1024), inline: false });
		const description = clip(event.culprit, 4096);
		return message("Sentry", {
			title: clip(event.title ?? event.message ?? "Error", 256),
			...(description ? { description } : {}),
			...(event.web_url ? { url: event.web_url } : {}),
			color: COLORS[level] ?? COLORS["error"]!,
			fields,
			...(event.datetime ? { timestamp: event.datetime } : {}),
		});
	},
};
