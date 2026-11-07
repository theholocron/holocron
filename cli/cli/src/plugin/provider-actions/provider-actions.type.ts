import type { CheckRow } from "@theholocron/kyber/ui";

/**
 * One step of a provider's `setup` or `doctor`, in the shape the shared renderer prints (`printCheckRows`): an id, a
 * title, `ok` / `fail` / `skip`, one line of detail and, for a failure, a line per problem.
 */
export type ProviderRow = CheckRow;

/** What a provider's `setup` and `doctor` are handed. */
export interface ProviderActionContext {
	/**
	 * `--dry-run`: `setup` reports what it would change as `ok` rows and changes nothing. `doctor` never changes
	 * anything, so it ignores this.
	 */
	dryRun: boolean;
}

/**
 * Something only one provider has (a Linear team's automation, a Discord server's roles) and no provider-neutral
 * command can express. It reports one row per step and does not stop at the first failure: a step that fails is a
 * `fail` row and the next step still runs. It never prints a token.
 */
export type ProviderAction = (ctx: ProviderActionContext) => Promise<ProviderRow[]>;

/** A provider's `setup` and `doctor`, as `holocron provider <name> setup|doctor` finds them. */
export interface ProviderActions {
	/** Makes what the provider's own config block declares. Optional. */
	setup?: ProviderAction;
	/** Compares what the provider's own config block declares with what exists, read-only. Optional. */
	doctor?: ProviderAction;
}
