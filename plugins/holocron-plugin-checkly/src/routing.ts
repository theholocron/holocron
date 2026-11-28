import type { MonitoringCheckInput } from "@theholocron/cli";

/**
 * Whether the config routes the check `checkName` away from the alert channel `channelName`: it declares the check with
 * a non-empty `alertChannels` that does not name the channel (compared without regard to case, as `setup notifications`
 * does). A check the config does not declare, or declares with no routes (or an empty list), alerts through every channel.
 */
export function routedAway(
	declared: readonly Pick<MonitoringCheckInput, "name" | "alertChannels">[],
	checkName: string,
	channelName: string
): boolean {
	const to = declared.find((d) => d.name === checkName)?.alertChannels;
	if (to === undefined || to.length === 0) return false;
	return !to.some((n) => n.toLowerCase() === channelName.toLowerCase());
}
