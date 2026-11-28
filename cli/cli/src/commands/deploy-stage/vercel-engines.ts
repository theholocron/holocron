/**
 * Vercel only accepts a major-version `engines.node` (`"22.x"`), and fails
 * the deployment's `npm install` step with `invalid_version_value` on an
 * open range like `">=22"` (holocron#911, found live: the deploy that
 * shipped holocron#910's fix never went live because of exactly this).
 * Takes the first major number in the package's own range, its floor, and
 * pins that major rather than passing the range through verbatim.
 *
 * @param engines The package's `engines` field, if it has one.
 * @returns `engines` with `node` pinned to a major; unchanged when it has no `node`.
 */
export function vercelEngines(engines: Record<string, string> | undefined): Record<string, string> | undefined {
	const range = engines?.["node"];
	if (!engines || !range) return engines;
	const major = /\d+/.exec(range)?.[0];
	if (!major) throw new Error(`cannot derive a Vercel Node.js major from engines.node "${range}"`);
	return { ...engines, node: `${major}.x` };
}
