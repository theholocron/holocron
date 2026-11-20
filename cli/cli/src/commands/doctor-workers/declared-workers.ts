import type { NotificationsLayout, Wiki, Workers } from "../../plugin/index.js";
import {
	DEFAULT_RELAY_SCRIPT,
	relaySecretBinding,
	relayWebhookBinding,
	wantsAnyRelay,
	wantsRelay,
} from "../notifications-setup/relay.js";
import { genericRelayFeeds } from "../relay-sources/generic-relay-feeds.js";
import type { DeclaredWorker } from "./doctor-workers.type.js";

/**
 * The Workers the config makes `holocron setup` deploy: the relay Worker of each notifications layout that feeds an
 * error tracker (`relay.host`, its `script` or the default name, and the two bindings the relay reads for the tracker,
 * when one is configured), and the reverse proxy of a wiki that has a custom domain behind one. A proxy Worker whose
 * provider does not say how it names it has `script: undefined`, which the check reports as a skip.
 */
export function declaredWorkers(input: {
	layouts: NotificationsLayout[];
	errors?: { providerName: string };
	wiki?: Pick<Wiki, "dnsRecord" | "proxyConfig">;
	workers?: Pick<Workers, "proxyScriptName">;
}): DeclaredWorker[] {
	const declared: DeclaredWorker[] = [];
	for (const layout of input.layouts) {
		const relay = layout.relay;
		if (!relay?.host || !wantsAnyRelay(layout)) continue;
		declared.push({
			label: "relay",
			script: relay.script ?? DEFAULT_RELAY_SCRIPT,
			host: relay.host,
			bindings: [
				...(input.errors && wantsRelay(layout) ? [input.errors.providerName] : []),
				...genericRelayFeeds(layout).map((f) => f.source),
			].flatMap((source) => [relayWebhookBinding(source), relaySecretBinding(source)]),
		});
	}
	const proxied = input.wiki?.proxyConfig?.() ? input.wiki.dnsRecord?.() : null;
	if (proxied) {
		const host = proxied.record.name;
		declared.push({ label: "wiki proxy", script: input.workers?.proxyScriptName?.(host), host, bindings: [] });
	}
	return declared;
}
