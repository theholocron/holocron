import { confirm } from "@inquirer/prompts";

import type { ProbeContext, ProbeRow } from "../../plugin/index.js";
import { commandFailureMessage } from "../../ui/command-failure/index.js";
import { NonInteractiveError } from "../../ui/non-interactive-error/index.js";
import { createProgress } from "../../ui/progress/index.js";
import { sanitizeDetail, stripControl } from "../../ui/provider-error/index.js";
import { statusRow } from "../../ui/status-row/index.js";
import { style } from "../../ui/style/index.js";
import type { ProbeReport, RunProbeInput } from "./probe.type.js";
import { createScrubber } from "./scrub.js";

const defaultInterrupt: NonNullable<RunProbeInput["onInterrupt"]> = (handler) => {
	const listener = () => void handler().finally(() => process.exit(130));
	process.once("SIGINT", listener);
	return () => void process.off("SIGINT", listener);
};

/**
 * Runs one probe under the rules every probe shares: what it prints is scrubbed, a change goes through `write` (skipped
 * on `--dry-run`), a probe that writes is asked about first, and what it registered to undo runs whether it succeeded,
 * failed or was interrupted.
 */
export async function runProbe(input: RunProbeInput): Promise<ProbeReport> {
	const progress = createProgress(input.print ?? ((line: string) => console.log(line)));
	const print = progress.print;
	const secrets = new Set(input.secrets ?? []);
	const scrub = createScrubber(secrets);
	const rows: ProbeRow[] = [];

	const emit = (row: ProbeRow): void => {
		const clean: ProbeRow = {
			status: row.status,
			label: scrub(stripControl(row.label)),
			...(row.detail ? { detail: scrub(sanitizeDetail(row.detail)) } : {}),
		};
		rows.push(clean);
		if (clean.status === "heading") print(`\n  ${style.header(clean.label)}`);
		else print(statusRow(clean.status === "info" ? "skip" : clean.status, [clean.label, clean.detail ?? ""]));
	};

	if (input.probe.writes && !input.dryRun && !input.yes) {
		const interactive = input.interactive ?? Boolean(process.stdin.isTTY);
		if (!interactive) {
			throw new NonInteractiveError(
				`\`${input.name}\` changes things on ${input.provider} (${input.probe.summary}); pass --yes to run it without asking`
			);
		}
		const proceed = await (input.confirm ?? ((message) => confirm({ message, default: false })))(
			`${input.name} changes things on ${input.provider}: ${input.probe.summary}. Continue?`
		);
		if (!proceed) {
			emit({ status: "info", label: input.name, detail: "cancelled; nothing was changed" });
			return { status: "cancelled", rows };
		}
	}

	const undo: Array<{ label: string; fn: () => Promise<void> }> = [];
	const runCleanups = async (): Promise<void> => {
		while (undo.length > 0) {
			const { label, fn } = undo.pop()!;
			try {
				await fn();
				emit({ status: "info", label: `cleaned up ${label}` });
			} catch (err) {
				emit({ status: "fail", label: `could not clean up ${label}`, detail: commandFailureMessage(err) });
			}
		}
	};

	const ctx: ProbeContext = {
		dryRun: input.dryRun,
		say: emit,
		secret: (value) => {
			if (value) secrets.add(value);
		},
		async write(label, fn) {
			if (!input.probe.writes) throw new Error(`${input.name} is read-only and cannot ${label}`);
			if (input.dryRun) {
				emit({ status: "info", label: `would ${label}` });
				return undefined;
			}
			return fn();
		},
		cleanup(label, fn) {
			// A dry run made nothing, so there is nothing to undo.
			if (!input.dryRun) undo.push({ label, fn });
		},
	};

	const stopListening = (input.onInterrupt ?? defaultInterrupt)(runCleanups);
	try {
		await progress.run(`${input.name}…`, () => input.probe.run(ctx));
	} catch (err) {
		emit({ status: "fail", label: input.name, detail: commandFailureMessage(err) });
	} finally {
		stopListening();
		await runCleanups();
	}

	const counts = {
		ok: rows.filter((r) => r.status === "ok").length,
		fail: rows.filter((r) => r.status === "fail").length,
	};
	if (counts.ok + counts.fail > 0) print(`\n${counts.ok} ok, ${counts.fail} fail`);
	return { status: counts.fail > 0 ? "fail" : "ok", rows };
}
