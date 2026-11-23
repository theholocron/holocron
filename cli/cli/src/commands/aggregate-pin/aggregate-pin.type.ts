/** What `ci.pin` asks of the ruleset: the pins to write, or why the option cannot apply to this repo. */
export interface AggregatePinPlan {
	/** Required context to the integration id that may satisfy it. Empty when the option is off or cannot apply. */
	pins: Record<string, number>;
	/** Set when `ci.pin` is declared but `ci / Required checks` is not a required check of this repo. */
	problem?: string;
}
