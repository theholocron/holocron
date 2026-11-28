import type { CheckRow } from "@theholocron/kyber/ui";
import { describeError } from "@theholocron/kyber/ui";

import { assertPluginsResolvable, PluginLoader } from "../../plugin/index.js";
import type { RunDoctorCiInput } from "./doctor-ci.type.js";
import { readShadowSamples } from "./read-shadow-samples.js";
import { shadowRow } from "./shadow-row.js";

const fail = (detail: string): CheckRow => ({
	id: "shadow",
	title: "Sentinel's ci shadow agrees with the Actions aggregate",
	status: "fail",
	detail,
	problems: [],
});

/**
 * The `shadow` row for `doctor ci --shadow`: loads only the `source` provider, reads the newest pull requests' two
 * aggregate verdicts and compares them with {@link shadowRow}. A missing provider, a provider that cannot list check runs
 * or a read that throws is a failing row with the reason, never a throw.
 */
export async function shadowRows(input: RunDoctorCiInput): Promise<CheckRow[]> {
	const providers = input.loaded.resolved.providers;
	if (!providers.source) return [fail("the config has no `source` provider to read the check runs with")];
	/* v8 ignore start -- the real loader is only built outside tests, which always inject one */
	const loader =
		input.loader ??
		new PluginLoader(
			{
				...input.loaded.resolved,
				providers: {
					source: providers.source,
					...(providers.credentials ? { credentials: providers.credentials } : {}),
				},
			},
			input.context
		);
	/* v8 ignore stop */
	try {
		await loader.load();
		assertPluginsResolvable(loader, "doctor ci");
		if (!loader.has("source")) {
			const failure = loader.loadFailures().find((f) => f.key === "source");
			return [
				fail(`the \`source\` provider is not available${failure ? ` (${describeError(failure.error)})` : ""}`),
			];
		}
		const source = loader.get("source");
		if (!source.listPullRequests || !source.listCheckRuns) {
			return [fail(`the \`${source.providerName}\` provider cannot list pull requests and check runs`)];
		}
		const samples = await readShadowSamples(
			{
				listPullRequests: source.listPullRequests.bind(source),
				listCheckRuns: source.listCheckRuns.bind(source),
			},
			input.shadowLimit
		);
		return [shadowRow(samples)];
	} catch (error) {
		return [fail(describeError(error))];
	}
}
