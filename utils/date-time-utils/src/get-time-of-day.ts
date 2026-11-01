/** A part of the day: `"morning"`, `"afternoon"` or `"evening"`. */
export type TTimeOfDay = "morning" | "afternoon" | "evening";

/** The part of the day for `date`'s local hour (the current time when `date` is omitted or invalid): `"morning"` before 11:00, `"afternoon"` from 11:00 to 17:59, otherwise `"evening"`.
 *
 * @example
 * ```ts
 * import { getTimeOfDay } from "@theholocron/date-time-utils";
 *
 * getTimeOfDay(); // e.g. "morning"
 * getTimeOfDay(new Date("2024-01-01T20:00:00")); // "evening"
 * ```
 */
export function getTimeOfDay(date?: Date): TTimeOfDay {
	// Validate if the passed date is a valid Date object
	const isValidDate = date instanceof Date && !isNaN(date.getTime());
	const currentHour = isValidDate ? date!.getHours() : new Date().getHours();

	if (currentHour >= 0 && currentHour < 11) {
		return "morning";
	}

	if (currentHour >= 11 && currentHour < 18) {
		return "afternoon";
	}

	// after 6pm
	return "evening";
}
