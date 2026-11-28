/** How the values several fragments give one key combine. */
export interface Strategy<V> {
	/** The value to start from. A strategy without one leaves the key out of the result until a fragment sets it. */
	empty?: V;
	/** Combine what has been merged so far with the next fragment's value. */
	merge: (prev: V, next: V) => V;
}
