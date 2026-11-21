import type { NotificationsLayout, RelaySourceCapability } from "../../plugin/index.js";
import { avatarProblem } from "../notifications-setup/avatar-problem.js";
import { declaredRelaySources } from "./declared-relay-sources.js";
import { genericRelayFeeds } from "./generic-relay-feeds.js";

/** The capabilities a relay source may name (see `RelaySourceCapability`). */
export const RELAY_SOURCE_CAPABILITIES: readonly RelaySourceCapability[] = [
	"deployment",
	"dns",
	"vault",
	"auth",
	"workers",
	"source",
];

/** An id is a URL path segment and part of a Worker binding name, so it is lower-case letters and digits. */
const ID = /^[a-z][a-z0-9]*$/;

/** A plugin's name, as `providers.<capability>` spells it: lower-case letters, digits and hyphens (`vercel`, `1password`). */
const PROVIDER = /^[a-z0-9][a-z0-9-]*$/;

/**
 * The first reason the layout's relay sources cannot work, or undefined. `errorsSource` is the error tracker's id when a
 * channel is fed by it, since the tracker's binding names are taken. Pure: it reads the layout and nothing else.
 */
export function relaySourcesProblem(layout: NotificationsLayout, errorsSource?: string): string | undefined {
	const declared = declaredRelaySources(layout);
	const feeds = genericRelayFeeds(layout);
	if (declared.length === 0 && feeds.length === 0) return undefined;
	if (!layout.relay?.host) {
		return "relay sources need `relay.host` — where the relay Worker answers";
	}
	const ids = new Set(declared.map((d) => d.id));
	for (const { id, spec } of declared) {
		if (!ID.test(id)) {
			return `relay source \`${id}\`: the id must be lower-case letters and digits, starting with a letter (it is a path and part of a binding name)`;
		}
		if (errorsSource !== undefined && id === errorsSource) {
			return `relay source \`${id}\` is the error tracker's own source — it is set up by \`relay.errors\`, not \`relay.sources\``;
		}
		if (!RELAY_SOURCE_CAPABILITIES.includes(spec?.capability)) {
			return `relay source \`${id}\`: \`capability\` must be one of ${RELAY_SOURCE_CAPABILITIES.join(", ")}`;
		}
		if (spec.provider !== undefined && !(typeof spec.provider === "string" && PROVIDER.test(spec.provider))) {
			return `relay source \`${id}\`: \`provider\` must be a plugin name, lower-case letters, digits and hyphens (\`vercel\`)`;
		}
		for (const key of ["events", "scope"] as const) {
			const list: unknown = spec[key];
			if (list !== undefined && !(Array.isArray(list) && list.every((item) => typeof item === "string"))) {
				return `relay source \`${id}\`: \`${key}\` must be a list of strings`;
			}
		}
	}
	const carriedBy = new Map<string, string>();
	for (const { source, channel, feed } of feeds) {
		if (!ids.has(source)) {
			return `channel \`${channel.name}\`: \`feeds.relay.${source}\` names no source — declare it in \`relay.sources\``;
		}
		const other = carriedBy.get(source);
		if (other !== undefined) {
			return `channels \`${other}\` and \`${channel.name}\` both carry relay source \`${source}\`, but one source posts to one channel — feed one`;
		}
		carriedBy.set(source, channel.name);
		const picture = avatarProblem(
			channel.name,
			`feeds.relay.${source}.avatar`,
			typeof feed === "object" ? feed.avatar : undefined
		);
		if (picture) return picture;
	}
	for (const { id } of declared) {
		if (!carriedBy.has(id)) {
			return `relay source \`${id}\` is carried by no channel — add \`feeds.relay.${id}\` to one`;
		}
	}
	// Discord matches webhook names without regard to case, so equal names would be one webhook and revoking one feed's URL would revoke both.
	for (const { channel } of feeds) {
		const names = new Map<string, string>();
		const own = (typeof channel.webhook === "object" ? channel.webhook.name : undefined) ?? channel.name;
		if (channel.webhook) names.set(own.toLowerCase(), "the channel's own webhook");
		for (const mine of feeds.filter((f) => f.channel === channel)) {
			const clash = names.get(mine.webhook.toLowerCase());
			if (clash !== undefined) {
				return `channel \`${channel.name}\`: the webhook for relay source \`${mine.source}\` and ${clash} are both named ${mine.webhook} — rename one`;
			}
			names.set(mine.webhook.toLowerCase(), `the webhook for relay source \`${mine.source}\``);
		}
	}
	return undefined;
}
