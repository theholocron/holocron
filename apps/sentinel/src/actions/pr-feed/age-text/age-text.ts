const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long ago something happened, in the largest whole unit: `just now`, `5 minutes ago`, `1 hour ago`, `3 days ago`. */
export function ageText(createdAt: string, now: Date): string {
	const elapsed = Math.max(0, now.getTime() - new Date(createdAt).getTime());
	if (elapsed < MINUTE) return "just now";
	const [value, unit] =
		elapsed >= DAY
			? [Math.floor(elapsed / DAY), "day"]
			: elapsed >= HOUR
				? [Math.floor(elapsed / HOUR), "hour"]
				: [Math.floor(elapsed / MINUTE), "minute"];
	return `${value} ${unit}${value === 1 ? "" : "s"} ago`;
}
