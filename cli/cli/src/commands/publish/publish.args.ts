import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";

export const publishArgs = (y: Argv<GlobalArgs>) =>
	y
		.option("initial", {
			type: "boolean",
			default: false,
			describe:
				"One-shot bootstrap publish for trusted-publishing-eligible packages (npm needs the " +
				"package to exist before Trusted Publishing can be configured for it). Skips the " +
				"steady-state OIDC path below — use only for a package's very first publish.",
		})
		.option("tag", {
			type: "string",
			describe: "npm distribution tag. Defaults to alpha for --initial, latest for a steady-state publish.",
		})
		.option("otp", {
			type: "string",
			describe: "One-time password from your authenticator (required if npm needs 2FA for writes)",
		})
		.option("sync-trust", {
			type: "array",
			describe:
				"Migrate npm Trusted Publisher config to a new workflow filename across every public " +
				"package: --sync-trust <old-file> <new-file>. See issue #689 — npm requires fresh " +
				"interactive 2FA per package; re-run after approving the printed authUrl if it stops early.",
		})
		.option("repo", {
			type: "string",
			describe: "owner/repo for Trusted Publisher config (--sync-trust). Defaults to theholocron/holocron.",
		})
		.option("group", {
			type: "string",
			describe:
				"Only this version group's packages: a folder of the repo (clients, observability). " +
				"Omitted, every public package in the workspace.",
		})
		.option("exclude-group", {
			type: "string",
			array: true,
			describe:
				"Everything except this version group (repeatable). The repo-wide release uses it so " +
				"it does not take in a group that is released on its own.",
		})
		.option("provenance", {
			type: "boolean",
			default: true,
			describe: "Publish with --provenance (steady-state only). Default on — free under CI/OIDC.",
		})
		.option("skip-already-published", {
			type: "boolean",
			default: false,
			describe:
				"Steady-state only: check `npm view <pkg>@<version>` before publishing each package and " +
				"skip it if that exact version already exists, instead of one bulk publish. For repos " +
				"that ship many independently-versioned packages where a release doesn't bump every one.",
		});

export type PublishArgs = InferArgs<typeof publishArgs>;
