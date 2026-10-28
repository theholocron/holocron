import { createHmac } from "node:crypto";
import { dirname } from "node:path";

import type { Errors, PluginLoader, PluginProbes, Vault } from "../../plugin/index.js";
import { notificationProviders } from "../notifications-channel-add/index.js";
import {
	DEFAULT_RELAY_CODE,
	DEFAULT_RELAY_SCRIPT,
	relaySecretBinding,
	relayWebhookBinding,
} from "../notifications-setup/relay.js";

/** The group of probes for the Comlink relay Worker (`apps/comlink`). It is an app, not a provider, so they are the CLI's own. */
export const COMLINK_PROVIDER = "comlink";

export interface ComlinkProbeDeps {
	loader: PluginLoader;
	fetch?: typeof fetch;
	env?: Record<string, string | undefined>;
	/** The vault of the app's own config (`apps/comlink`), given the app's directory relative to the repo root. */
	appVault?: (appDir: string) => Promise<Vault | undefined>;
}

interface Relay {
	host: string;
	script: string;
	/** The app's directory relative to the repo root, from where the built Worker is. */
	appDir: string;
	/** The id the relay knows the error tracker by (`sentry`): the path it answers on and the stem of its bindings. */
	source: string;
}

/** Where the relay answers and what it is called, from the notifications layout and the `errors` provider. */
function relayOf(loader: PluginLoader): Relay {
	const layout = notificationProviders(loader)[0]?.layout;
	const host = layout?.relay?.host;
	if (!host) throw new Error("no relay is declared: add `relay.host` to the notifications layout");
	const found = loader.has("errors") ? loader.get("errors") : undefined;
	const errors: Errors | undefined = Array.isArray(found) ? found[0] : found;
	if (!errors) throw new Error("the relay carries an error tracker's alerts, and no `errors` provider is available");
	return {
		host,
		script: layout.relay?.script ?? DEFAULT_RELAY_SCRIPT,
		appDir: dirname(dirname(layout.relay?.code ?? DEFAULT_RELAY_CODE)),
		source: errors.providerName.toLowerCase(),
	};
}

/** An event-alert delivery in the shape Sentry sends, labelled so nobody mistakes it for a real error. */
const testDelivery = () =>
	JSON.stringify({
		action: "triggered",
		data: {
			event: {
				title: "Holocron probe: Comlink delivery check",
				culprit: "holocron probe comlink deliver",
				level: "info",
				environment: "holocron-probe",
				project_name: "holocron-probe",
				datetime: new Date().toISOString(),
			},
			triggered_rule: "holocron probe",
		},
	});

/** A secret by name from a vault: the bare name when the vault can take one, else as a reference. `undefined` if it cannot be read. */
async function readSecret(vault: Vault | undefined, name: string): Promise<string | undefined> {
	if (!vault) return undefined;
	try {
		return (await (vault.readSecret ? vault.readSecret(name) : vault.read(name))) || undefined;
	} catch {
		return undefined;
	}
}

export function comlinkProbes(deps: ComlinkProbeDeps): PluginProbes {
	const http = deps.fetch ?? fetch;
	const env = deps.env ?? process.env;
	return {
		unsigned: {
			summary:
				"Send the relay requests it must refuse: a GET (405), an unsigned POST (401), an unknown source (404).",
			writes: false,
			async run(probe) {
				const { host, source } = relayOf(deps.loader);
				const expect = async (label: string, want: number, path: string, init?: RequestInit) => {
					const res = await http(`https://${host}/${path}`, init);
					probe.say({
						status: res.status === want ? "ok" : "fail",
						label,
						detail:
							res.status === want
								? `${res.status}`
								: `got ${res.status}, wanted ${want}${res.status === 404 ? " (is the Worker deployed on this host?)" : ""}`,
					});
				};
				await expect(`GET /${source}`, 405, source);
				await expect(`unsigned POST /${source}`, 401, source, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: "{}",
				});
				await expect("POST /no-such-source", 404, "no-such-source", { method: "POST", body: "{}" });
			},
		},

		bindings: {
			summary: "Show whether the Worker has the secret bindings it needs, by name (never the values).",
			writes: false,
			async run(probe) {
				const { script, source } = relayOf(deps.loader);
				const workers = deps.loader.has("workers") ? deps.loader.get("workers") : undefined;
				if (!workers?.secretNames) throw new Error("the `workers` provider cannot list a Worker's secrets");
				const have = new Set(await workers.secretNames(script));
				const need: Array<[string, string]> = [
					[relayWebhookBinding(source), "run `holocron notifications setup`"],
					[
						relaySecretBinding(source),
						"add it to the vault and run `holocron secrets sync`, or `notifications setup`",
					],
				];
				for (const [name, fix] of need) {
					probe.say(
						have.has(name)
							? { status: "ok", label: name, detail: `bound on ${script}` }
							: { status: "fail", label: name, detail: `missing on ${script}: ${fix}` }
					);
				}
				const extra = [...have].filter((n) => !need.some(([name]) => name === n));
				if (extra.length > 0) probe.say({ status: "info", label: "other secrets", detail: extra.join(", ") });
			},
		},

		deliver: {
			summary:
				"Send the relay a correctly signed test alert, so a labelled embed lands in the errors channel. The message stays there.",
			writes: true,
			async run(probe) {
				const { host, source, appDir } = relayOf(deps.loader);
				// The headers and the body are Sentry's; another source would need its own signing.
				if (source !== "sentry")
					throw new Error(`deliver knows how to sign a Sentry delivery, not a ${source} one`);
				const name = relaySecretBinding(source);
				// Saying what it would do needs no secret.
				if (probe.dryRun) {
					probe.say({ status: "info", label: "would send a signed test alert to the relay" });
					return;
				}
				// The app keeps its secrets by its own config, so that vault is asked first, then the repo's.
				let secret = env[name];
				if (!secret && deps.appVault) secret = await readSecret(await deps.appVault(appDir), name);
				if (!secret && deps.loader.has("vault")) secret = await readSecret(deps.loader.get("vault"), name);
				if (!secret) {
					throw new Error(
						`no signing secret: set ${name} in the environment, or give ${appDir}/holocron.config a vault that holds it`
					);
				}
				probe.secret(secret);
				const body = testDelivery();
				// A dry run returned above, so `write` has run and answered.
				const status = (await probe.write("send a signed test alert to the relay", async () => {
					const res = await http(`https://${host}/${source}`, {
						method: "POST",
						headers: {
							"content-type": "application/json",
							"sentry-hook-resource": "event_alert",
							"sentry-hook-signature": createHmac("sha256", secret!).update(body).digest("hex"),
						},
						body,
					});
					return res.status;
				}))!;
				probe.say(
					status === 202
						? {
								status: "ok",
								label: "the relay accepted it",
								detail: `look in #errors for "Holocron probe: Comlink delivery check"; delete the message by hand, a probe cannot`,
							}
						: {
								status: "fail",
								label: `the relay answered ${status}, not 202`,
								detail:
									status === 401
										? "the signing secret does not match the Worker's"
										: status === 502
											? "the relay could not post to Discord"
											: "see the Worker's logs",
							}
				);
			},
		},
	};
}
