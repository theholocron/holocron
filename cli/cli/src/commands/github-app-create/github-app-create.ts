/**
 * `holocron new github-app` — create a GitHub App from a manifest (GitHub's manifest flow), and keep its
 * credentials in the private `.holocron/.private/.credentials` file `auth export` uses, to import into a credentials environment.
 *
 * The flow has one click in it that cannot be done for you: a local page posts the manifest to GitHub, you press
 * "Create GitHub App", GitHub redirects back to a one-shot server on the loopback address with a code, and the code is
 * exchanged for the App's id, private key and webhook secret. The code works once and the key is shown once, so the
 * file is checked (git ignores it, it is not there already) before the browser opens. Nothing but names and paths is
 * ever printed.
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { appManifestPage, buildAppManifest, convertAppManifest, serveAppManifest } from "@theholocron/dagobah";
import { dotenvLine, finishCredentialsFile, isGitIgnored, writeCredentialsFile } from "@theholocron/kyber/secrets";
import { openPath } from "@theholocron/kyber/ui";
import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import { ignoreAdvice, resolveCredentialsFile } from "../../private-dir/index.js";
import type { GithubAppCreateReport, RunGithubAppCreateInput } from "./github-app-create.type.js";

const COMMAND = "new github-app";
const DEFAULT_WEBHOOK_SECRET_VAR = "SENTINEL_WEBHOOK_SECRET";

export async function runGithubAppCreate(input: RunGithubAppCreateInput): Promise<GithubAppCreateReport> {
	const print = input.print ?? ((line: string) => console.error(line));
	const logger = input.logger ?? getLogger();
	const refuse = (reason: string, ...message: string[]): GithubAppCreateReport => {
		for (const line of message) print(line);
		logger.warn({ status: "fail", reason }, COMMAND);
		return { status: "fail" };
	};

	if ((input.platform ?? process.platform) === "win32") {
		return refuse("windows", "cannot make the credentials file private on Windows: its mode bits are not enforced");
	}

	// Everything that can be wrong is found before the browser opens: the code works once and the key is shown once.
	let base: unknown;
	try {
		base = JSON.parse(
			(input.readFile ?? ((path: string) => readFileSync(path, "utf8")))(resolve(input.dir, input.manifest))
		);
	} catch (err) {
		return refuse("manifest", `could not read the manifest ${input.manifest}: ${errorMessage(err)}`);
	}
	try {
		buildAppManifest({
			base,
			name: input.name,
			webhookUrl: input.webhookUrl,
			redirectUrl: "http://127.0.0.1/callback",
		});
	} catch (err) {
		return refuse("manifest", errorMessage(err));
	}
	// The default is `.holocron/.private/.credentials`, whose directory is made first so git can be asked about it.
	const target = resolveCredentialsFile(input.dir, input.file, input.makeDir);
	const file = target.path;
	const git = (input.isIgnored ?? isGitIgnored)(file);
	if (git === "tracked" || git === "unknown") {
		return refuse(
			"not-ignored",
			git === "tracked"
				? `refusing to write credentials to ${file}: git does not ignore it, so it could be committed`
				: `refusing to write credentials to ${file}: git could not say whether it ignores it`,
			ignoreAdvice(target.isDefault, "choose another path with --file")
		);
	}
	if (!input.force && (input.exists ?? existsSync)(file)) {
		return refuse(
			"exists",
			`${file} is already there and is never overwritten`,
			"delete it, or pass --force to replace it"
		);
	}

	const state = input.state ?? randomBytes(16).toString("hex");
	const action = input.org
		? `https://github.com/organizations/${encodeURIComponent(input.org)}/settings/apps/new?state=${state}`
		: `https://github.com/settings/apps/new?state=${state}`;
	const server = await (input.serve ?? serveAppManifest)({
		state,
		page: (redirectUrl) =>
			appManifestPage(
				action,
				buildAppManifest({ base, name: input.name, webhookUrl: input.webhookUrl, redirectUrl })
			),
	});
	let app;
	try {
		print(`opening ${server.url} — press "Create GitHub App" on GitHub (this page waits up to five minutes)`);
		(input.openUrl ?? openPath)(server.url);
		app = await (input.convert ?? convertAppManifest)(await server.code);
	} catch (err) {
		return refuse("create", `the App was not created: ${errorMessage(err)}`);
	} finally {
		server.close();
	}

	const settings = input.org
		? `https://github.com/organizations/${input.org}/settings/apps/${app.slug}/advanced`
		: `https://github.com/settings/apps/${app.slug}/advanced`;
	let identity;
	try {
		const lines = [
			dotenvLine("SENTINEL_GITHUB_APP_ID", String(app.id)),
			dotenvLine("SENTINEL_GITHUB_APP_PRIVATE_KEY", app.pem),
			dotenvLine(input.webhookSecretVar || DEFAULT_WEBHOOK_SECRET_VAR, app.webhookSecret),
		];
		if (lines.includes(null)) throw new Error("a value cannot be written as a dotenv line");
		identity = (input.writeFile ?? writeCredentialsFile)(file, `${lines.join("\n")}\n`, input.force === true);
	} catch (err) {
		logger.warn({ status: "fail", reason: "write", slug: app.slug }, COMMAND);
		for (const line of [
			`created ${app.slug}, but could not keep its credentials: ${errorMessage(err)}`,
			`they are shown once: delete the App (${settings}) and run this again`,
		]) {
			print(line);
		}
		return { status: "fail", slug: app.slug, appId: app.id };
	}

	print(`created ${app.slug} (App id ${app.id}): ${app.htmlUrl}`);
	print(`install it on the repositories it should see: https://github.com/apps/${app.slug}/installations/new`);
	print("");
	const cleaned = await finishCredentialsFile({
		path: file,
		identity,
		print,
		holds: "the App's credentials",
		importHint:
			"import it in the 1Password app: Developer, View Environments, the Environment, Import .env file; it holds SENTINEL_GITHUB_APP_ID, SENTINEL_GITHUB_APP_PRIVATE_KEY and the webhook secret",
		keep: input.keep,
		interactive: input.interactive,
		shred: input.shred,
		waitForImport: input.waitForImport,
	});
	const status = cleaned ? "ok" : "fail";
	logger.info({ status, slug: app.slug }, COMMAND);
	return { status, slug: app.slug, appId: app.id, file };
}
