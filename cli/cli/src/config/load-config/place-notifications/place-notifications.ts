import type { ConfigDirArea } from "@theholocron/datapad";
import { ConfigError } from "@theholocron/kyber/config";

import type { HolocronConfig, ProviderOptions, RawProviderEntry } from "../../config/index.js";

type Tuple = [provider: string, options: ProviderOptions];

const isTuple = (entry: unknown): entry is Tuple =>
	Array.isArray(entry) &&
	entry.length === 2 &&
	typeof entry[0] === "string" &&
	typeof entry[1] === "object" &&
	entry[1] !== null &&
	!Array.isArray(entry[1]);

const providerName = (entry: unknown): unknown => (isTuple(entry) ? entry[0] : entry);

/** Index of the entry the layout belongs to in a multi-provider list: the first `discord`. */
function findDiscord(entries: readonly unknown[]): number {
	return entries.findIndex((entry) => providerName(entry) === "discord");
}

function withLayout(entry: unknown, layout: unknown): Tuple {
	return isTuple(entry) ? [entry[0], { ...entry[1], layout }] : [entry as string, { layout }];
}

/**
 * Set `layout` on the notifications provider from `.holocron/notifications.*`. The entry may be a name (`"discord"`),
 * a `[name, options]` tuple, or a list (the first `discord` entry gets it). Throws `ConfigError` when the provider is
 * not set or already has an inline `layout`.
 */
export function placeNotifications(raw: HolocronConfig, area: ConfigDirArea): HolocronConfig {
	if (typeof area.value !== "object" || area.value === null || Array.isArray(area.value)) {
		throw new ConfigError(`${area.path} must export the notifications layout as an object`);
	}
	const entry: RawProviderEntry | undefined = raw.providers?.notifications;
	const hint = `Set it in one place: remove the inline \`layout\` or delete ${area.path}`;

	let placed: RawProviderEntry;
	if (entry === undefined) {
		throw new ConfigError(
			`${area.path} holds the notifications layout, but providers.notifications is not set. ` +
				`Add \`notifications: ["discord", { guildId }]\` to providers`
		);
	} else if (Array.isArray(entry) && !isTuple(entry)) {
		const index = findDiscord(entry);
		if (index === -1) {
			throw new ConfigError(
				`${area.path} holds the notifications layout, but providers.notifications has no discord entry`
			);
		}
		const target = entry[index];
		if (isTuple(target) && target[1].layout !== undefined) {
			throw new ConfigError(
				`the notifications layout is set in providers.notifications and in ${area.path}. ${hint}`
			);
		}
		placed = entry.map((item, i) => (i === index ? withLayout(item, area.value) : item));
	} else {
		if (isTuple(entry) && entry[1].layout !== undefined) {
			throw new ConfigError(
				`the notifications layout is set in providers.notifications and in ${area.path}. ${hint}`
			);
		}
		placed = withLayout(entry, area.value);
	}
	return { ...raw, providers: { ...raw.providers, notifications: placed } };
}
