/**
 * `holocron notifications link` — record which server member is which GitHub account, by having the member
 * sign in with the provider. The provider reports the GitHub account it has verified they own, so a link
 * cannot be claimed for someone else's account. Writes the links file `sync-roles` reads.
 *
 * Signs in on this machine (a one-shot listener on localhost) unless the hosted service (Sentinel) answers
 * its health route, in which case it points you there. Nothing but the two public ids is stored; the token
 * the provider hands over is discarded as soon as it has been read.
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, type Notifications, PluginLoader, type Source } from "../../plugin/index.js";
import { describeProviderError, logReason } from "../../ui/provider-error/index.js";
import { style } from "../../ui/style/index.js";
import { notificationProviders, pickProvider, whyMissing } from "../notifications-channel-add/index.js";
import { linksLocation, serializeLinks, upsertLink } from "../notifications-sync-roles/links.js";
import { readLinks } from "../notifications-sync-roles/notifications-sync-roles.js";
import { DEFAULT_LOCAL_PORT, redirectInstruction, resolveCallback } from "./callback.js";
import { waitForCode } from "./listener.js";
import type { NotificationsLinkReport, RunNotificationsLinkInput } from "./notifications-link.type.js";

/* v8 ignore start -- hands a URL to the operating system's browser, which a test must not do */
/** Opens a URL in the system browser; resolves once it has been handed over. */
async function openInBrowser(url: string): Promise<void> {
	const [cmd, args]: [string, string[]] =
		process.platform === "darwin"
			? ["open", [url]]
			: process.platform === "win32"
				? ["cmd", ["/c", "start", "", url]]
				: ["xdg-open", [url]];
	await new Promise<void>((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: "ignore", detached: true });
		child.once("error", reject);
		child.once("spawn", () => {
			child.unref();
			resolve();
		});
	});
}

/* v8 ignore stop */

export async function runNotificationsLink(input: RunNotificationsLinkInput): Promise<NotificationsLinkReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	/* v8 ignore next -- the real loader is only built outside tests, which always inject one */
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "notifications link");

	const dryRun = input.context.dryRun ?? false;
	const refuse = (message: string, reason: string = message): NotificationsLinkReport => {
		print(`  ${style.fail(message)}`);
		print("");
		print(style.header("0 ok, 1 fail, 0 skipped"));
		logger.warn({ reason }, "notifications link");
		return { status: "fail", message };
	};

	let notifications: Notifications;
	try {
		notifications = pickProvider(
			notificationProviders(loader),
			input.provider,
			(p) => typeof p.signIn === "function",
			{ infinitive: "sign members in", gerund: "signing members in" }
		);
	} catch (err) {
		return refuse(errorMessage(err));
	}
	const layout = notifications.layout ?? {};
	const source = loader.has("source") ? (loader.get("source") as Source) : undefined;
	if (!source?.readFile || !source.writeFile) {
		return refuse(
			whyMissing(
				loader,
				"source",
				"no `source` provider that can read and write files is available for the links file"
			)
		);
	}
	let location: { repo: string; path: string };
	try {
		location = linksLocation(layout, input.context.org, notifications.providerName);
	} catch (err) {
		return refuse(errorMessage(err));
	}

	const port = layout.links?.localPort ?? DEFAULT_LOCAL_PORT;
	const choice = await resolveCallback({
		...(layout.links?.hostedUrl ? { hostedUrl: layout.links.hostedUrl } : {}),
		port,
		...(input.fetch ? { fetch: input.fetch } : {}),
	});
	print(
		`  ${style.skip(`sign-in ${choice.kind === "hosted" ? "is hosted" : "runs on this machine"}: ${choice.reason}`)}`
	);

	if (choice.kind === "hosted") {
		const start = `${choice.redirectUri.replace(/\/callback$/, "")}/start`;
		print(`  open ${start} in a browser to link your account`);
		print("");
		print(style.header("0 ok, 0 fail, 1 skipped"));
		return { status: "ok", via: "hosted" };
	}

	if (dryRun) {
		print(
			`  ${style.skip(`would sign in on ${choice.redirectUri} and write the link to ${location.repo}/${location.path}`)}`
		);
		print(`  ${style.skip(`first, ${redirectInstruction(choice.redirectUri)}`)}`);
		print("");
		print(style.header("0 ok, 0 fail, 1 skipped"));
		return { status: "dry-run", via: "local" };
	}

	const signIn = notifications.signIn!();
	const state = (input.newState ?? (() => randomBytes(16).toString("hex")))();
	try {
		const wait =
			input.waitForCode ?? ((i) => waitForCode({ port: i.port, state: i.state, onListening: i.onListening }));
		const open = input.openBrowser ?? openInBrowser;
		const url = await signIn.authorizeUrl({ redirectUri: choice.redirectUri, state });
		print(`  if your browser does not open, go to: ${url}`);
		print(
			`  (it must be allowed to come back to ${choice.redirectUri}: ${redirectInstruction(choice.redirectUri)})`
		);
		const code = await wait({
			port,
			state,
			onListening: () =>
				void open(url).catch(() => print(`  ${style.skip("could not open a browser; use the link above")}`)),
		});
		const who = await signIn.complete({ redirectUri: choice.redirectUri, code });
		if (!who.github) {
			return refuse(
				`${who.name ?? who.member} has no verified GitHub account on ${notifications.providerName}: connect GitHub under User Settings → Connections, then run this again`
			);
		}

		// Read, change, write the version that was read; one retry if someone else wrote in between.
		let outcome = { changed: false };
		for (let attempt = 0; attempt < 2; attempt++) {
			const file = await source.readFile(location.path, location.repo);
			const links = file
				? await readLinks(source, layout, input.context.org, notifications.providerName)
				: { version: 1 as const, links: [] };
			const next = upsertLink(links, { github: who.github.id, login: who.github.login, member: who.member });
			outcome = { changed: next.changed };
			if (!next.changed) break;
			try {
				await source.writeFile(location.path, serializeLinks(next.file), {
					message: `chore(notifications): link ${who.github.login} to ${notifications.providerName} member ${who.member}`,
					...(file ? { version: file.version } : {}),
					repo: location.repo,
				});
				break;
			} catch (err) {
				const status = (err as { status?: number }).status;
				if (attempt === 0 && (status === 409 || status === 422)) continue;
				throw err;
			}
		}
		print(
			`  ${style.success(`${outcome.changed ? "linked" : "already linked"} ${who.github.login} (github ${who.github.id}) to ${who.name ?? who.member} (${who.member})`)}`
		);
		print("");
		print(style.header(`${outcome.changed ? 1 : 0} ok, 0 fail, ${outcome.changed ? 0 : 1} skipped`));
		logger.info({ provider: notifications.providerName, changed: outcome.changed }, "notifications link");
		return {
			status: "ok",
			via: "local",
			linked: { github: who.github.id, login: who.github.login, member: who.member, changed: outcome.changed },
		};
	} catch (err) {
		return refuse(describeProviderError(err), logReason(err));
	}
}
