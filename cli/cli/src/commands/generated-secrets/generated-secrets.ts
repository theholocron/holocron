/**
 * The secrets the CLI may make up (spec `tech-rotate-generated-secrets`). A name is here only when its value is random
 * and nobody else issues or holds a copy: a vendor's API token, or a signing secret the vendor also stores, must not be
 * invented, so anything not listed is refused by `generateSecretValue()`.
 */
import { randomBytes } from "node:crypto";

import type { GeneratedSecret, RandomBytes } from "./generated-secrets.type.js";

export const GENERATED_SECRETS: Readonly<Record<string, GeneratedSecret>> = {
	CRON_SECRET: {
		bytes: 32,
		encoding: "hex",
		note: "the bearer Vercel's cron sends to Sentinel's /api/scheduled",
	},
};

/** The recipe for `name`, or `undefined` when the CLI does not make that secret. */
export function generatedSecret(name: string): GeneratedSecret | undefined {
	return Object.hasOwn(GENERATED_SECRETS, name) ? GENERATED_SECRETS[name] : undefined;
}

/**
 * A fresh value for a secret in {@link GENERATED_SECRETS}. The value is never printed or logged by the caller.
 *
 * @throws {Error} When `name` is not one the CLI generates (the message lists the ones it does).
 */
export function generateSecretValue(name: string, random: RandomBytes = randomBytes): string {
	const recipe = generatedSecret(name);
	if (!recipe) {
		throw new Error(
			`${name} is not a secret the CLI generates (${Object.keys(GENERATED_SECRETS).join(", ")}): a token a vendor issues cannot be made up`
		);
	}
	return Buffer.from(random(recipe.bytes)).toString(recipe.encoding);
}
