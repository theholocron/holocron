import type { CapabilityKey, Cardinality, CardinalityFor } from "./capabilities.type.js";

/** How many providers each capability resolves to: one (`"single"`) or several active at once (`"many"`). */
export const CARDINALITY = {
	/** `source` has exactly one provider. */
	source: "single",
	/** `ci` has exactly one provider. */
	ci: "single",
	/** `secrets` has exactly one provider. */
	secrets: "single",
	/** `environments` has exactly one provider. */
	environments: "single",
	/** `issues` has exactly one provider. */
	issues: "single",
	/** `deployment` has exactly one provider. */
	deployment: "single",
	/** `storage` has exactly one provider. */
	storage: "single",
	/** `auth` has exactly one provider. */
	auth: "single",
	/** `vault` has exactly one provider. */
	vault: "single",
	/** `dns` has exactly one provider. */
	dns: "single",
	/** `tooling` can have several providers active at once. */
	tooling: "many",
	/** `notifications` can have several providers active at once. */
	notifications: "many",
	/** `analytics` can have several providers active at once. */
	analytics: "many",
	/** `errors` has exactly one provider. */
	errors: "single",
	/** `logs` has exactly one provider. */
	logs: "single",
	/** `monitoring` has exactly one provider. */
	monitoring: "single",
	/** `wiki` has exactly one provider. */
	wiki: "single",
	/** `workers` has exactly one provider. */
	workers: "single",
} as const satisfies Record<CapabilityKey, Cardinality>;

/**
 * No capabilities are strictly required — repos without secrets (e.g. org
 * community health repos) legitimately omit vault. Plugins validate their
 * own requirements at call time.
 */
export const REQUIRED_CAPABILITIES: readonly CapabilityKey[] = [] as const;

export { ProviderApiError } from "@theholocron/http-client";

/**
 * A provider could not finish an edit because the bot lacks a permission it should not keep. Carries what a person
 * needs to give it for one run and take it away again, so `setup` can walk them through it.
 */
export class ElevationRequiredError extends Error {
	/** Lets a caller tell this error from any other by name, across package copies. */
	override name = "ElevationRequiredError";
	constructor(
		message: string,
		/** What a person must approve to give the permission for one run and to take it away again. */
		readonly elevation: {
			/** The permission, in the provider's own name for it. */
			permission: string;
			/** Where to approve giving it; absent when the provider could not build one. */
			grantUrl?: string;
			/** Where to approve taking it away again; absent when the provider could not build one. */
			revokeUrl?: string;
			/** A name for the permission a person would recognise, when {@link permission} is the provider's code for it. */
			label?: string;
			/** The permission is meant to stay once given: there is nothing to take away afterwards. */
			keep?: boolean;
			/** What the edit had already changed before it was refused, so a retry does not hide it from the summary. */
			applied?: string[];
		},
		options?: ErrorOptions
	) {
		super(message, options);
	}
}

/**
 * A provider cannot do a read because it has no token for it. A check that meets this skips with the message instead
 * of failing: the token is missing, not wrong.
 */
export class MissingTokenError extends Error {
	/** Lets a caller tell this error from any other by name, across package copies. */
	override name = "MissingTokenError";
}

/** A webhook payload failed signature verification, so it must not be trusted. */
export class WebhookVerificationError extends Error {
	/** Lets a caller tell this error from any other by name, across package copies. */
	override name = "WebhookVerificationError";
}

/** Whether `key` is a capability that can have several providers active at once. */
export function isMulti<K extends CapabilityKey>(key: K): CardinalityFor<K> extends "many" ? true : false {
	return (CARDINALITY[key] === "many") as CardinalityFor<K> extends "many" ? true : false;
}
