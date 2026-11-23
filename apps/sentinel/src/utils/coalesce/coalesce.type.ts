/** A computation for one key that is running now, and whether another delivery arrived while it ran. */
export interface Flight<T> {
	/** Set by a delivery that arrived while the computation ran: it runs once more when it ends. */
	again: boolean;
	/** Settles with the result of the last run. */
	done: Promise<T>;
}
