import { style } from "@theholocron/kyber/ui";

import type {
	DeclaredRelaySource,
	EnsuredRelaySource,
	RelaySourceProvider,
	RelaySourceRun,
} from "./relay-sources.type.js";

/**
 * Make or adopt the vendor's webhook for one relay source through its provider, and report it like the rest of
 * `setup`. The provider is given a fresh secret to use only if the vendor lets the caller choose and it makes the
 * webhook now. Nothing the vendor returns as a secret is printed; the caller hands it to the Worker. `--dry-run` asks
 * the provider nothing. Throws when the provider cannot make a webhook, or when it fails.
 */
export async function ensureRelaySource(
	source: DeclaredRelaySource,
	provider: RelaySourceProvider,
	input: { host: string; newSecret: () => string },
	run: RelaySourceRun
): Promise<EnsuredRelaySource> {
	const { id, spec } = source;
	const name = spec.name ?? id.charAt(0).toUpperCase() + id.slice(1);
	const url = `https://${input.host}/${id}`;
	if (!provider.ensureRelaySource) {
		throw new Error(`the \`${provider.providerName}\` provider cannot make a webhook for relay source ${id}`);
	}
	if (run.dryRun) {
		run.print(`  ${style.skip(`would ensure the ${provider.providerName} webhook ${name} for ${url}`)}`);
		run.made(false);
		return { todo: [] };
	}
	const result = await provider.ensureRelaySource({
		source: id,
		url,
		name,
		...(spec.events ? { events: spec.events } : {}),
		...(spec.scope ? { scope: spec.scope } : {}),
		...(spec.options ? { options: spec.options } : {}),
		secret: input.newSecret(),
	});
	const changed = result.created || result.updated.length > 0;
	const verb = result.created ? "created" : changed ? "updated" : "exists ";
	const detail = result.updated.length > 0 ? `: ${result.updated.join(", ")}` : "";
	run.print(
		`  ${(changed ? style.success : style.skip)(`${verb} ${provider.providerName} webhook ${name}${detail}`)}`
	);
	run.made(changed);
	if (!result.secret) {
		// A webhook adopted from an earlier run is no news: its secret cannot be read back and the Worker has it. A new one
		// with no secret leaves the Worker unable to verify anything, so say so.
		run.print(
			result.created
				? `  ${style.warn(`${provider.providerName} made the webhook but gave no signing secret for ${id}: set COMLINK_${id.toUpperCase()}_SECRET on the Worker yourself`)}`
				: `  ${style.skip(`${provider.providerName} gave no signing secret for ${id}, so the Worker keeps the one it has`)}`
		);
	}
	return { ...(result.secret ? { secret: result.secret } : {}), todo: result.todo ?? [] };
}
