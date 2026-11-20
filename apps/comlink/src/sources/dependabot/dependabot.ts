import { clip, message } from "../../discord/discord.js";
import { sameText, signHex } from "../../hmac/hmac.js";
import { MalformedDelivery, type Source } from "../source.type.js";

const ACTIONS: Record<string, { label: string; color: number }> = {
	created: { label: "New vulnerability", color: 0xe5484d },
	auto_reopened: { label: "Vulnerability reopened", color: 0xe5484d },
	reopened: { label: "Vulnerability reopened", color: 0xe5484d },
	reintroduced: { label: "Vulnerability reintroduced", color: 0xe5484d },
	dismissed: { label: "Vulnerability dismissed", color: 0x889096 },
	auto_dismissed: { label: "Vulnerability dismissed", color: 0x889096 },
	fixed: { label: "Vulnerability fixed", color: 0x30a46c },
	withdrawn: { label: "Advisory withdrawn", color: 0x889096 },
};

interface DependabotDelivery {
	action?: unknown;
	repository?: { full_name?: unknown; html_url?: unknown };
	alert?: {
		number?: unknown;
		html_url?: unknown;
		state?: unknown;
		dependency?: {
			manifest_path?: unknown;
			scope?: unknown;
			package?: { name?: unknown; ecosystem?: unknown };
			vulnerable_version_range?: unknown;
			first_patched_version?: { identifier?: unknown } | null;
		};
		security_advisory?: { ghsa_id?: unknown; summary?: unknown; severity?: unknown };
	};
}

function text(value: unknown): string | undefined {
	return typeof value === "string" && value ? value : undefined;
}

function safeUrl(value: unknown): string | undefined {
	return typeof value === "string" && /^https:\/\//.test(value) ? value : undefined;
}

/**
 * GitHub Dependabot alert webhook. GitHub signs the exact body with HMAC-SHA256 in `X-Hub-Signature-256` when a
 * webhook secret is configured. Alert lifecycle changes are carried; assignment-only changes are dropped.
 */
export const dependabot: Source = {
	id: "dependabot",

	async verify(headers, raw, secret) {
		const signature = headers.get("x-hub-signature-256");
		if (!secret || !signature || !signature.startsWith("sha256=")) return false;
		return sameText(`sha256=${await signHex(secret, raw)}`, signature.toLowerCase());
	},

	format(headers, payload) {
		if (headers.get("x-github-event") !== "dependabot_alert") return null;
		const delivery = payload as DependabotDelivery | null;
		if (!delivery || typeof delivery.action !== "string")
			throw new MalformedDelivery("dependabot_alert without an action");
		const event = ACTIONS[delivery.action];
		if (!event) return null;
		const alert = delivery.alert;
		if (!alert) throw new MalformedDelivery(`${delivery.action} without alert`);

		const packageName = text(alert.dependency?.package?.name) ?? "dependency";
		const repo = text(delivery.repository?.full_name) ?? "repository";
		const advisory = alert.security_advisory;
		const fields: Array<{ name: string; value: string; inline: boolean }> = [
			{ name: "Repository", value: clip(repo, 1024), inline: true },
			{ name: "Severity", value: clip(text(advisory?.severity) ?? "unknown", 1024), inline: true },
		];
		const version = text(alert.dependency?.vulnerable_version_range);
		if (version) fields.push({ name: "Vulnerable versions", value: clip(version, 1024), inline: true });
		const patched = text(alert.dependency?.first_patched_version?.identifier);
		if (patched) fields.push({ name: "First patched version", value: clip(patched, 1024), inline: true });
		const manifest = text(alert.dependency?.manifest_path);
		if (manifest) fields.push({ name: "Manifest", value: clip(manifest, 1024), inline: true });
		const ghsa = text(advisory?.ghsa_id);
		if (ghsa) fields.push({ name: "Advisory", value: clip(ghsa, 1024), inline: true });

		const number = typeof alert.number === "number" ? ` #${alert.number}` : "";
		const summary = text(advisory?.summary) ?? `${packageName} has a security alert`;
		const url = safeUrl(alert.html_url) ?? safeUrl(delivery.repository?.html_url);
		return message("Dependabot", {
			title: clip(`${event.label}: ${packageName}${number}`, 256),
			...(summary ? { description: clip(summary, 4096) } : {}),
			...(url ? { url } : {}),
			color: event.color,
			fields,
		});
	},
};
