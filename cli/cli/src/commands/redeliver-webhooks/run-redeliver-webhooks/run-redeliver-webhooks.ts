/**
 * `holocron redeliver webhooks [--since <time>] [--app <name>] [--dry-run] [--yes]` — the recovery step after a Sentinel
 * outage (spec `process-sentinel-posts-ci`, SPEC-0099, recovery 2).
 *
 * For each registered GitHub App instance it reads the App's webhook delivery log with the App's own JWT, keeps the
 * deliveries whose latest attempt did not succeed (`failedDeliveries()`), and asks GitHub to deliver each one again, oldest
 * first and once. It repairs every Sentinel handler (the `#prs` feed, board status, role sync, the checks, the `ci`
 * aggregate), not only the aggregate, and replaying is safe because each handler recomputes from the API. It never
 * reaches a delivery that was never attempted, and GitHub keeps the log only for a limited time.
 *
 * The App's id and key are read in memory from its vault environment, as `doctor github-app` reads them, and never
 * printed. It asks once before redelivering unless `--yes`; without a terminal that is a `NonInteractiveError`, except on
 * `--dry-run`, which lists what it would redeliver and calls nothing that writes.
 */

import { confirm } from "@inquirer/prompts";
import { listAppDeliveries, redeliverAppDelivery } from "@theholocron/github-client";
import {
	type CheckRow,
	describeError,
	NonInteractiveError,
	printCheckRows,
	printCheckSummary,
	style,
	summariseChecks,
} from "@theholocron/kyber/ui";

import { getLogger } from "../../../observability/logger/index.js";
import { assertPluginsResolvable, PluginLoader } from "../../../plugin/index.js";
import { readAppCredentials, scrubbed } from "../../doctor-github-app/index.js";
import { parseSince } from "../../sync-issues/parse-since/index.js";
import { failedDeliveries } from "../../webhook-deliveries/index.js";
import type { DeliveryApi, RedeliverWebhooksReport, RunRedeliverWebhooksInput } from "./run-redeliver-webhooks.type.js";

const DEFAULT_SINCE = "1d";

const defaultApi: DeliveryApi = { listAppDeliveries, redeliverAppDelivery };

const row = (id: string, status: CheckRow["status"], detail: string): CheckRow => ({
	id,
	title: id,
	status,
	detail,
	problems: [],
});

/** Runs `holocron redeliver webhooks`; see the file's comment. */
export async function runRedeliverWebhooks(input: RunRedeliverWebhooksInput): Promise<RedeliverWebhooksReport> {
	/* v8 ignore next -- the console is only used outside tests, which inject `print` */
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	/* v8 ignore next -- the real GitHub calls are only used outside tests, which inject `api` */
	const api = input.api ?? defaultApi;
	const dryRun = Boolean(input.context.dryRun);
	const rows: CheckRow[] = [];
	const finish = (): RedeliverWebhooksReport => {
		printCheckRows(rows, print);
		const summary = summariseChecks(rows);
		printCheckSummary(summary, print);
		const status = summary.fail > 0 ? "fail" : "ok";
		logger.info({ ...summary, status }, "redeliver webhooks");
		return { status, rows };
	};
	const fail = (id: string, detail: string): RedeliverWebhooksReport => {
		rows.push(row(id, "fail", detail));
		return finish();
	};
	print(style.header(`Holocron redeliver webhooks${dryRun ? " (dry-run)" : ""}`));
	print("");

	let since: string;
	try {
		since = parseSince(input.since ?? DEFAULT_SINCE, (input.now ?? Date.now)());
	} catch (error) {
		return fail("since", describeError(error).replace(/^sync issues: /, ""));
	}

	const all = input.loaded.resolved.githubApps ?? [];
	if (all.length === 0) {
		rows.push(row("github-app", "skip", "no `githubApps` are declared in holocron.config.ts"));
		return finish();
	}
	const instances = input.app === undefined ? all : all.filter((instance) => instance.name === input.app);
	if (instances.length === 0) {
		return fail("app", `no \`githubApps\` entry is named "${input.app}" (${all.map((i) => i.name).join(", ")})`);
	}

	/* v8 ignore start -- the real loader is only built outside tests, which always inject one */
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	/* v8 ignore stop */
	await loader.load();
	assertPluginsResolvable(loader, "redeliver webhooks");

	const pending: Array<{
		app: string;
		creds: Parameters<DeliveryApi["redeliverAppDelivery"]>[0];
		delivery: ReturnType<typeof failedDeliveries>[number];
	}> = [];
	for (const instance of instances) {
		const read = await readAppCredentials(instance, loader);
		if ("reason" in read) {
			rows.push(row(`${instance.name}`, "skip", read.reason));
			continue;
		}
		try {
			const failed = failedDeliveries(await api.listAppDeliveries(read.creds, { since }));
			if (failed.length === 0) rows.push(row(instance.name, "ok", `no failed deliveries since ${since}`));
			for (const delivery of failed) pending.push({ app: instance.name, creds: read.creds, delivery });
		} catch (error) {
			rows.push(
				row(instance.name, "fail", `cannot read the delivery log: ${scrubbed(error, [read.creds.privateKey])}`)
			);
		}
	}
	if (pending.length === 0) return finish();

	const label = ({ app, delivery }: (typeof pending)[number]) => {
		const what = delivery.action === null ? delivery.event : `${delivery.event}.${delivery.action}`;
		return {
			id: `${app}:${delivery.id}`,
			text: `${what} of ${delivery.deliveredAt} (${delivery.status || `status ${delivery.statusCode}`})`,
		};
	};
	if (dryRun) {
		for (const item of pending) rows.push(row(label(item).id, "skip", `would redeliver ${label(item).text}`));
		return finish();
	}

	/* v8 ignore next -- the terminal is only asked outside tests, which inject `interactive` */
	const interactive = input.interactive ?? Boolean(process.stdin.isTTY);
	if (!input.yes && !interactive) {
		throw new NonInteractiveError(
			"`redeliver webhooks` asks GitHub to deliver webhooks again; pass --yes to run it without asking, or --dry-run to preview"
		);
	}
	/* v8 ignore next -- inquirer only runs outside tests, which inject `confirm` */
	const ask = input.confirm ?? ((message: string) => confirm({ message, default: false }));
	if (
		!input.yes &&
		!(await ask(`Redeliver ${pending.length} failed webhook deliver${pending.length === 1 ? "y" : "ies"}?`))
	) {
		rows.push(row("redeliver", "skip", "not confirmed; nothing was redelivered"));
		return finish();
	}

	for (const item of pending) {
		const { id, text } = label(item);
		try {
			await api.redeliverAppDelivery(item.creds, item.delivery.id);
			rows.push(row(id, "ok", `redelivered ${text}`));
		} catch (error) {
			rows.push(row(id, "fail", scrubbed(error, [item.creds.privateKey])));
		}
	}
	return finish();
}
