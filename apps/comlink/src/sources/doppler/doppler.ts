import { clip, message } from "../../discord/discord.js";
import { sameText, signHex } from "../../hmac/hmac.js";
import { MalformedDelivery, type Source } from "../source.type.js";

interface DopplerDelivery {
	type?: unknown;
	config?: { name?: unknown; environment?: unknown; slug?: unknown };
	project?: { name?: unknown; slug?: unknown };
	workplace?: { name?: unknown };
	diff?: { added?: unknown; removed?: unknown; updated?: unknown };
}

/** The names Doppler lists in a diff, as text; anything that is not a list of strings is left out. */
function names(list: unknown): string[] {
	return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
}

function text(value: unknown): string | undefined {
	return typeof value === "string" && value ? value : undefined;
}

/**
 * Doppler. A delivery is signed with `X-Doppler-Signature`: `sha256=` and the hex HMAC-SHA256 of the body under the
 * webhook's signing secret, checked against the body exactly as received. Only `config.secrets.update` is carried, and
 * only the names of the secrets that changed are shown, never a value (Doppler sends none).
 */
export const doppler: Source = {
	id: "doppler",

	async verify(headers, raw, secret) {
		const signature = headers.get("x-doppler-signature");
		if (!secret || !signature) return false;
		return sameText(`sha256=${await signHex(secret, raw)}`, signature.toLowerCase());
	},

	format(_headers, payload) {
		const delivery = payload as DopplerDelivery | null;
		if (!delivery || typeof delivery.type !== "string") throw new MalformedDelivery("delivery without a type");
		if (delivery.type !== "config.secrets.update") return null;
		const config = delivery.config;
		if (!config) throw new MalformedDelivery("config.secrets.update without config");
		const project = text(delivery.project?.name) ?? text(delivery.project?.slug) ?? "project";
		const env = text(config.environment) ?? text(config.slug) ?? "config";
		const configName = text(config.name);
		const fields: Array<{ name: string; value: string; inline: boolean }> = [
			{ name: "Project", value: clip(project, 1024), inline: true },
			{ name: "Config", value: clip(configName ?? env, 1024), inline: true },
		];
		for (const [label, list] of [
			["Added", names(delivery.diff?.added)],
			["Updated", names(delivery.diff?.updated)],
			["Removed", names(delivery.diff?.removed)],
		] as const) {
			if (list.length > 0) fields.push({ name: label, value: clip(list.join(", "), 1024), inline: false });
		}
		return message("Doppler", {
			title: clip(`Secrets changed: ${project} / ${configName ?? env}`, 256),
			color: 0x3e63dd,
			fields,
		});
	},
};
