/**
 * `holocron apply properties` — add the capabilities the organization's `holocron_capabilities` property lacks.
 *
 * `doctor repo` reports the drift; this is the separate, deliberate step that fixes it. The allowed values are
 * organization-wide, so it asks first (`--yes` skips the question; without a terminal it refuses instead of hanging),
 * `--dry-run` only reads, and it only ever adds a value: nothing is removed or reordered, and the rest of the
 * property's definition is kept. The values wanted are every capability the CLI defines. It needs a token with the
 * organization's Custom properties: admin.
 */

import { confirm } from "@inquirer/prompts";
import { describeError, NonInteractiveError, statusRow } from "@theholocron/kyber/ui";

import { assertPluginsResolvable, PluginLoader, type Source } from "../../../plugin/index.js";
import { whyMissing } from "../../notifications-channel-add/index.js";
import { CAPABILITIES_PROPERTY, capabilityValues } from "../capability-property/index.js";
import type { PropertiesApplyReport, RunPropertiesApplyInput } from "./run-properties-apply.type.js";

export async function runPropertiesApply(input: RunPropertiesApplyInput): Promise<PropertiesApplyReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const stop = (status: "fail" | "skip", reason: string): PropertiesApplyReport => {
		print(statusRow(status, ["apply properties", reason]));
		return { status, reason };
	};

	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "apply properties");
	if (!loader.has("source")) {
		return stop("skip", whyMissing(loader, "source", "no `source` provider to read the property with"));
	}
	const source = loader.get("source") as Source;
	if (!source.getOrgPropertyValues || !source.addOrgPropertyValues) {
		return stop("skip", `the \`${source.providerName}\` provider cannot read or change an organization property`);
	}

	let missing: string[];
	try {
		const allowed = await source.getOrgPropertyValues(CAPABILITIES_PROPERTY);
		if (allowed === undefined) {
			return stop(
				"fail",
				`cannot read the organization's ${CAPABILITIES_PROPERTY} definition: the token needs Custom properties: read, and the property must exist and be a select`
			);
		}
		const have = new Set(allowed);
		missing = capabilityValues().filter((v) => !have.has(v));
	} catch (err) {
		return stop("fail", describeError(err));
	}
	if (missing.length === 0) {
		print(statusRow("ok", ["apply properties", `${CAPABILITIES_PROPERTY} already allows every capability`]));
		return { status: "ok", added: [] };
	}

	if (input.context.dryRun) {
		print(statusRow("skip", ["apply properties", `dry run: would add ${missing.join(", ")}`]));
		return { status: "ok", added: missing };
	}

	if (!input.yes) {
		const interactive = input.interactive ?? Boolean(process.stdin.isTTY);
		if (!interactive) {
			throw new NonInteractiveError(
				`\`apply properties\` changes an organization-wide property; pass --yes to run it without asking`
			);
		}
		const proceed = await (input.confirm ?? ((message) => confirm({ message, default: false })))(
			`Allow ${missing.join(", ")} in ${CAPABILITIES_PROPERTY} for the whole organization?`
		);
		if (!proceed) {
			print(statusRow("skip", ["apply properties", "cancelled; nothing was changed"]));
			return { status: "cancelled" };
		}
	}

	try {
		const added = await source.addOrgPropertyValues(CAPABILITIES_PROPERTY, missing);
		print(
			statusRow("ok", ["apply properties", `${CAPABILITIES_PROPERTY}: added ${added.join(", ") || "nothing"}`])
		);
		return { status: "ok", added };
	} catch (err) {
		return stop("fail", describeError(err));
	}
}
