import type { Flight } from "./coalesce.type.js";

/** How many extra runs one flight makes for deliveries that arrive while it runs, so a long burst cannot keep it going forever. */
export const COALESCE_MAX_EXTRA_RUNS = 2;

const defaultFlights = new Map<string, Flight<unknown>>();

/**
 * Runs `run` for `key`, sharing the work between deliveries that arrive together. While a run for the key is in
 * progress, a later caller does not start a second one: it marks the flight, and the flight runs once more when it
 * ends (up to {@link COALESCE_MAX_EXTRA_RUNS} times), so state that changed after the first read is read again, and every
 * waiting caller gets the result of that last run. A burst of N deliveries for one commit therefore costs at most three
 * runs in one instance instead of N, and none of them can be answered with state older than its own arrival.
 */
export function coalesce<T>(
	key: string,
	run: () => Promise<T>,
	flights: Map<string, Flight<unknown>> = defaultFlights
): Promise<T> {
	const live = flights.get(key) as Flight<T> | undefined;
	if (live !== undefined) {
		live.again = true;
		return live.done;
	}
	const flight: Flight<T> = { again: false, done: Promise.resolve(undefined as T) };
	flight.done = (async () => {
		try {
			let result = await run();
			for (let extra = 0; flight.again && extra < COALESCE_MAX_EXTRA_RUNS; extra += 1) {
				flight.again = false;
				result = await run();
			}
			return result;
		} finally {
			flights.delete(key);
		}
	})();
	flights.set(key, flight);
	return flight.done;
}
