/**
 * @param channel The release's channel: its prerelease identifier (`alpha`), or `main` for a stable release.
 * @param changedFiles `undefined` when there's no previous release to diff against.
 */
export function shouldDeploy({
	channel,
	configuredChannel,
	changedFiles,
	paths,
}: {
	channel: string;
	configuredChannel: string;
	changedFiles: string[] | undefined;
	paths: string[];
}): { deploy: boolean; reason: string } {
	if (channel !== configuredChannel) {
		return { deploy: false, reason: `channel "${channel}" isn't "${configuredChannel}"` };
	}
	if (changedFiles === undefined) return { deploy: true, reason: "no previous release to diff against" };
	const touched = changedFiles.find((file) => paths.some((path) => file.startsWith(path)));
	return touched
		? { deploy: true, reason: `the release changes ${touched}` }
		: { deploy: false, reason: `the release changes nothing under ${paths.join(", ")}` };
}
