import type { PublishFailure } from "./publish-failures.type.js";

/** The command that publishes what is still missing for the version the checkout is on. */
export const REPUBLISH_COMMAND = "holocron publish package --skip-already-published";

function advice(failures: readonly PublishFailure[]): string[] {
	const out: string[] = [];
	if (failures.some((f) => f.kind === "tlog-conflict")) {
		out.push(
			"A sigstore 409 that survives retries means the tarball is identical to one already in the transparency log (an earlier publish of the same bytes). Retrying cannot fix it: change the package's contents and release again."
		);
	}
	if (failures.some((f) => f.kind === "failed")) {
		out.push(
			`For any other failure, fix the cause and run \`${REPUBLISH_COMMAND}\` (add \`--group <folder>\` for a version group) at the tag it happened on; it publishes only what npm lacks. \`holocron doctor releases\` names a tag npm never received.`
		);
	}
	return out;
}

/** Plain lines printed at the end of a run that left packages unpublished, all failures together. */
export function formatPublishFailures(failures: readonly PublishFailure[]): string[] {
	const lines = [`  ✗ ${failures.length} package(s) not published:`];
	for (const f of failures) {
		lines.push(
			f.kind === "tlog-conflict"
				? `    - ${f.name}@${f.version}: sigstore 409, identical tarball already in the transparency log`
				: `    - ${f.message}`
		);
	}
	for (const line of advice(failures)) lines.push(`  → ${line}`);
	return lines;
}

/** The same report as Markdown for the job summary. */
export function publishFailuresMarkdown(failures: readonly PublishFailure[]): string {
	const rows = failures.map(
		(f) =>
			`| \`${f.name}@${f.version}\` | ${f.kind === "tlog-conflict" ? "sigstore 409 (identical tarball already logged)" : "failed"} |`
	);
	return [
		"## Packages not published",
		"",
		"| Package | Reason |",
		"| --- | --- |",
		...rows,
		"",
		...advice(failures).flatMap((a) => [a, ""]),
	]
		.join("\n")
		.trimEnd();
}
