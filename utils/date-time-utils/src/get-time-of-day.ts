export type TTimeOfDay = "morning" | "afternoon" | "evening";

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
