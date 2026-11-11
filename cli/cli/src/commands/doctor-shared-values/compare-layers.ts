import { createHmac, randomBytes } from "node:crypto";

import type { LayerSecrets, SharedPair } from "./doctor-shared-values.type.js";

/**
 * Finds, for every pair of layers, the secrets that hold the same value. A value is never compared as text: each is
 * turned into an HMAC under a salt made fresh for this call, so a digest means nothing outside it and is held only in
 * these maps. The result carries names, never a value or a digest.
 *
 * Only concealed entries are compared. An empty value is ignored. The same value under two names counts (`A = B`). A pair where either name is in `allow`
 * (compared without regard to case) is left out.
 *
 * @param layers - The layers that were read, in `local, dev, ci, prod` order.
 * @param allow - Names shared on purpose.
 * @returns One entry per pair of layers, `names` empty when nothing is shared.
 */
export function compareLayers(layers: LayerSecrets[], allow: string[]): SharedPair[] {
	const salt = randomBytes(32);
	const allowed = new Set(allow.map((name) => name.toUpperCase()));
	const digests = layers.map((layer) => {
		const byDigest = new Map<string, string[]>();
		for (const { name, value, concealed } of layer.entries) {
			if (!concealed || !value) continue;
			const digest = createHmac("sha256", salt).update(value).digest("hex");
			byDigest.set(digest, [...(byDigest.get(digest) ?? []), name]);
		}
		return byDigest;
	});

	const pairs: SharedPair[] = [];
	for (let later = 1; later < layers.length; later++) {
		for (let earlier = 0; earlier < later; earlier++) {
			const names = new Set<string>();
			for (const [digest, laterNames] of digests[later]!) {
				for (const a of laterNames) {
					for (const b of digests[earlier]!.get(digest) ?? []) {
						if (allowed.has(a.toUpperCase()) || allowed.has(b.toUpperCase())) continue;
						names.add(a.toUpperCase() === b.toUpperCase() ? a : `${a} = ${b}`);
					}
				}
			}
			pairs.push({ layer: layers[later]!.layer, other: layers[earlier]!.layer, names: [...names].sort() });
		}
	}
	return pairs;
}
