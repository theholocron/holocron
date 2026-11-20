import { clip, message } from "../../discord/discord.js";
import { sameText, signHex } from "../../hmac/hmac.js";
import { MalformedDelivery, type Source } from "../source.type.js";

/** The deployment events that are carried, with the colour and the words the embed shows. */
const EVENTS: Record<string, { color: number; label: string }> = {
	"deployment.created": { color: 0x3e63dd, label: "Deployment started" },
	"deployment.ready": { color: 0x30a46c, label: "Deployment ready" },
	"deployment.succeeded": { color: 0x30a46c, label: "Deployment succeeded" },
	"deployment.promoted": { color: 0x30a46c, label: "Deployment promoted" },
	"deployment.error": { color: 0xe5484d, label: "Deployment failed" },
	"deployment.canceled": { color: 0x889096, label: "Deployment canceled" },
};

interface VercelDelivery {
	type?: unknown;
	createdAt?: unknown;
	payload?: {
		deployment?: { id?: string; name?: string; url?: string; meta?: Record<string, unknown> };
		links?: { deployment?: unknown };
		name?: string;
		target?: string | null;
	};
}

/** Only an http(s) address becomes the embed's link. */
function safeUrl(url: unknown): string | undefined {
	return typeof url === "string" && /^https?:\/\//.test(url) ? url : undefined;
}

/** A host the payload gives bare (`app-abc.vercel.app`) as a link. */
function hostUrl(host: unknown): string | undefined {
	return typeof host === "string" && host ? safeUrl(/^https?:\/\//.test(host) ? host : `https://${host}`) : undefined;
}

/**
 * Vercel (project and team webhooks). A delivery is signed with `x-vercel-signature`, a hex HMAC-SHA1 of the body under
 * the webhook's secret, checked against the body exactly as received. A re-serialised form is never tried. Only
 * deployment events are carried; any other type is acknowledged and dropped.
 */
export const vercel: Source = {
	id: "vercel",

	async verify(headers, raw, secret) {
		const signature = headers.get("x-vercel-signature");
		if (!secret || !signature) return false;
		return sameText(await signHex(secret, raw, "SHA-1"), signature.toLowerCase());
	},

	format(_headers, payload) {
		const delivery = payload as VercelDelivery | null;
		if (!delivery || typeof delivery.type !== "string") throw new MalformedDelivery("delivery without a type");
		const event = EVENTS[delivery.type];
		if (!event) return null;
		const body = delivery.payload;
		const deployment = body?.deployment;
		if (!deployment) throw new MalformedDelivery(`${delivery.type} without payload.deployment`);
		const name = deployment.name ?? body.name ?? "deployment";
		const fields: Array<{ name: string; value: string; inline: boolean }> = [
			{ name: "Project", value: clip(name, 1024), inline: true },
			{ name: "Target", value: clip(body.target ?? "preview", 1024), inline: true },
		];
		const meta = deployment.meta ?? {};
		const branch = meta["githubCommitRef"];
		if (typeof branch === "string" && branch)
			fields.push({ name: "Branch", value: clip(branch, 1024), inline: true });
		const commit = meta["githubCommitMessage"];
		const description = typeof commit === "string" ? clip(commit, 4096) : "";
		const url = safeUrl(body.links?.deployment) ?? hostUrl(deployment.url);
		return message("Vercel", {
			title: clip(`${event.label}: ${name}`, 256),
			...(description ? { description } : {}),
			...(url ? { url } : {}),
			color: event.color,
			fields,
			...(typeof delivery.createdAt === "number"
				? { timestamp: new Date(delivery.createdAt).toISOString() }
				: {}),
		});
	},
};
