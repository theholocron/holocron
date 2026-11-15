/**
 * `holocron doctor tokens` — does every token a plugin declares for a layer carry the permissions the declaration says,
 * and is it still fresh?
 *
 * For each layer (`local`, `dev`, `ci`, `prod`) and each token a configured plugin declares for it
 * (`PluginToken.expect`, read by `tokenExpectations()`), it reads that layer's Environment in memory and runs the
 * provider's `token` probe against the token it holds there, the same flow as `probe <provider> token --environment <layer>`
 * (`environmentTokens()`, `runProbe()`). One row per token per layer: it fails for a permission the token must not have,
 * one it lacks, a token the layer should hold and does not, or a token past its rotation age or near its expiry.
 *
 * Read-only. It prints names, counts and dates, never a token: the probes' output is scrubbed of every token in use. A
 * provider with no `token` probe, no declared layer, or one that cannot be read is a skip with the reason.
 */

import {
	type CheckRow,
	describeError,
	printCheckRows,
	printCheckSummary,
	summariseChecks,
} from "@theholocron/kyber/ui";

import { ENVIRONMENT_LAYERS } from "../../credentials-environments/index.js";
import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, PluginLoader, type PluginProbes, type ProbeRow } from "../../plugin/index.js";
import type { PluginToken } from "../auth/index.js";
import { memoVault } from "../doctor-secrets/index.js";
import { ownerEnvironments } from "../owner-environments/index.js";
import { defaultProviderTokens, environmentTokens, HoldsNoTokenError } from "../probe/probe-token/index.js";
import { runProbe } from "../probe/run-probe.js";
import { type LayerTokenExpectation, tokenExpectations } from "../token-expectations/index.js";
import type { DoctorTokensReport, RunDoctorTokensInput } from "./doctor-tokens.type.js";
import { summariseProbeRows } from "./summarise-probe-rows.js";

const PROBE = "token";

const row = (
	id: string,
	title: string,
	status: CheckRow["status"],
	detail: string,
	problems: string[] = []
): CheckRow => ({
	id,
	title,
	status,
	detail,
	problems,
});

/** One provider the config names, with the tokens its plugin lists and what they declare. */
interface Declared {
	provider: string;
	tokens: readonly PluginToken[];
	expectations: LayerTokenExpectation[];
}

export async function runDoctorTokens(input: RunDoctorTokensInput): Promise<DoctorTokensReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const makeLoader = input.makeLoader ?? ((context) => new PluginLoader(input.loaded.resolved, context));
	const loader = input.loader ?? makeLoader(input.context);
	await loader.load();
	assertPluginsResolvable(loader, "doctor tokens");

	const rows: CheckRow[] = [];
	const probes = loader.probes();
	const declared: Declared[] = [];
	/* v8 ignore next -- the real importer reads installed plugin packages, which tests replace with `providerTokens` */
	const providerTokens = input.providerTokens ?? defaultProviderTokens(input.loaded);
	for (const provider of providersOf(input.loaded.resolved.providers)) {
		let tokens: readonly PluginToken[];
		try {
			tokens = await providerTokens(provider);
		} catch (err) {
			rows.push(row(`tokens:${provider}`, provider, "skip", `could not read its tokens: ${describeError(err)}`));
			continue;
		}
		const expectations = tokenExpectations(tokens);
		if (expectations.length === 0) {
			rows.push(row(`tokens:${provider}`, provider, "skip", "info: declares no token layers, nothing to check"));
		} else if (!usableProbe(probes.get(provider))) {
			rows.push(
				row(
					`tokens:${provider}`,
					provider,
					"skip",
					`info: has no \`${PROBE}\` probe loaded, so its tokens are not checked`
				)
			);
		} else {
			declared.push({ provider, tokens, expectations });
		}
	}

	if (declared.length > 0) {
		const vault = loader.has("vault") ? memoVault(loader.get("vault")) : undefined;
		for (const layer of ENVIRONMENT_LAYERS) {
			for (const entry of declared) {
				const wanted = entry.expectations.filter((e) => e.layer === layer);
				if (wanted.length === 0) continue;
				rows.push(...(await checkLayer({ input, makeLoader, probes, vault, entry, layer, wanted })));
			}
		}
	}

	printCheckRows(rows, print);
	const summary = summariseChecks(rows);
	printCheckSummary(summary, print);

	const status = summary.fail > 0 ? "fail" : summary.ok === 0 ? "skip" : "ok";
	logger.info({ ...summary, status }, "doctor tokens");
	return {
		status,
		rows,
		summary,
		...(status === "skip"
			? { reason: rows.map((r) => r.detail).join("; ") || "no plugin declares a token layer" }
			: {}),
	};
}

/** The provider names the config lists, once each. */
function providersOf(providers: RunDoctorTokensInput["loaded"]["resolved"]["providers"]): string[] {
	const names = Object.values(providers).flatMap((entry) =>
		entry.cardinality === "single" ? [entry.tuple.provider] : entry.tuples.map((t) => t.provider)
	);
	return [...new Set(names)];
}

const usableProbe = (probes: PluginProbes | undefined): boolean => probes?.[PROBE]?.acceptsToken === true;

interface LayerCheck {
	input: RunDoctorTokensInput;
	makeLoader: NonNullable<RunDoctorTokensInput["makeLoader"]>;
	probes: ReadonlyMap<string, PluginProbes>;
	vault: Parameters<typeof environmentTokens>[0]["vault"];
	entry: Declared;
	layer: LayerTokenExpectation["layer"];
	wanted: LayerTokenExpectation[];
}

const rowId = (layer: string, provider: string, envName: string) => `tokens:${layer}:${provider}:${envName}`;
const rowTitle = (layer: string, provider: string, envName: string) => `${layer}: ${envName} (${provider})`;

/** One row per token the provider declares for the layer: read the layer's Environment, then probe each token it holds. */
async function checkLayer(c: LayerCheck): Promise<CheckRow[]> {
	const { provider, tokens } = c.entry;
	const id = (e: LayerTokenExpectation) => rowId(c.layer, provider, e.envName);
	const title = (e: LayerTokenExpectation) => rowTitle(c.layer, provider, e.envName);
	let held: Awaited<ReturnType<typeof environmentTokens>>;
	try {
		held = await environmentTokens({
			provider,
			environment: c.layer,
			repoRoot: c.input.context.repoRoot,
			gitExec: c.input.gitExec,
			configured: ownerEnvironments(c.input.loaded.resolved).names,
			vault: c.vault,
			tokens,
		});
	} catch (err) {
		if (err instanceof HoldsNoTokenError) {
			// The layer declares the tokens, so an Environment that holds none of them is wrong, not unread.
			return c.wanted.map((e) => row(id(e), title(e), "fail", "not held in this layer", [err.message]));
		}
		return c.wanted.map((e) =>
			row(id(e), title(e), "skip", `could not read the Environment: ${describeError(err)}`)
		);
	}

	const rows: CheckRow[] = [];
	for (const e of c.wanted) {
		const token = held.held.find((h) => h.envName === e.envName);
		if (!token) {
			rows.push(
				row(id(e), title(e), "fail", `not held in ${held.environment}`, [
					`${e.envName} is declared for ${c.layer}`,
				])
			);
			continue;
		}
		rows.push(summariseProbeRows(id(e), title(e), await probeToken(c, e, token.token)));
	}
	return rows;
}

/** Runs the provider's token probe against one token, as `probe <provider> token --environment <layer>` does. */
async function probeToken(c: LayerCheck, e: LayerTokenExpectation, token: string): Promise<ProbeRow[]> {
	const provider = c.entry.provider;
	const context = {
		...c.input.context,
		cliTokens: { ...c.input.context.cliTokens, [provider]: token },
	};
	try {
		const reloaded = c.makeLoader(context);
		await reloaded.load();
		const probe = reloaded.probes().get(provider)?.[PROBE] ?? c.probes.get(provider)![PROBE]!;
		const report = await runProbe({
			name: `${provider} ${PROBE}`,
			provider,
			probeName: PROBE,
			args: ["--layer", c.layer, "--token-name", e.envName],
			probe,
			dryRun: false,
			yes: false,
			interactive: false,
			secrets: [token, ...Object.values(context.cliTokens)],
			print: () => {},
			onInterrupt: () => () => {},
		});
		return report.rows;
	} catch (err) {
		// A probe that cannot run is a failure of this token's row, with the reason scrubbed of the token.
		return [
			{
				status: "fail",
				label: `${provider} ${PROBE}`,
				detail: describeError(err).split(token).join("[redacted]"),
			},
		];
	}
}
