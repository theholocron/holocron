/**
 * `holocron notifications create-server` — makes the server a layout describes, from nothing.
 *
 * A bot can create a server (while it is in few of them), and a server it creates already has it as a member,
 * so there is no invite step for the bot. The bot owns it at first, applies the whole layout (it can, as owner),
 * then invites the person who should own it, waits for them to join, and hands the server over. The new server
 * id is written into the config so every other command finds it.
 */

import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, type Notifications, PluginLoader } from "../../plugin/index.js";
import { describeProviderError, logReason } from "../../ui/provider-error/index.js";
import { style } from "../../ui/style/index.js";
import { notificationProviders, pickProvider } from "../notifications-channel-add/index.js";
import { runNotificationsSetup } from "../notifications-setup/index.js";
import type {
	NotificationsCreateServerReport,
	RunNotificationsCreateServerInput,
} from "./notifications-create-server.type.js";
import { writeGuildId } from "./write-guild-id.js";

/** The provider that can create a server and hand it over. */
export function pickServerCreator(providers: Notifications[], wanted?: string): Notifications {
	return pickProvider(
		providers,
		wanted,
		(p) =>
			typeof p.createServer === "function" &&
			typeof p.inviteLink === "function" &&
			typeof p.hasMember === "function" &&
			typeof p.transferServer === "function",
		{ infinitive: "create a server", gerund: "creating a server" }
	);
}

export async function runNotificationsCreateServer(
	input: RunNotificationsCreateServerInput
): Promise<NotificationsCreateServerReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	/* v8 ignore next -- the real loader is only built outside tests, which always inject one */
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "notifications create-server");

	const dryRun = input.context.dryRun ?? false;
	const sleep = input.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
	const refuse = (message: string, reason: string = message): NotificationsCreateServerReport => {
		print(`  ${style.fail(message)}`);
		print("");
		print(style.header("0 ok, 1 fail, 0 skipped"));
		logger.warn({ reason }, "notifications create-server");
		return { status: "fail", message };
	};

	let notifications: Notifications;
	try {
		notifications = pickServerCreator(notificationProviders(loader), input.provider);
	} catch (err) {
		return refuse(errorMessage(err));
	}
	if (!input.resume && !input.name?.trim()) return refuse("the server needs a name: pass --name");
	if (!/^\d{1,20}$/.test(input.owner)) {
		return refuse("--owner is the new owner's member id on the provider (digits only)");
	}

	const layout = notifications.layout;
	// Where the invite leads: the server's welcome channel, else its first channel.
	const inviteChannel =
		layout?.server?.systemChannel ??
		layout?.server?.rulesChannel ??
		layout?.categories?.flatMap((c) => c.channels ?? [])[0]?.name;
	if (!inviteChannel) return refuse("the layout has no channel to invite the owner through");

	if (dryRun) {
		print(
			`  ${style.skip(`would create the server "${input.name ?? ""}", apply the layout, invite member ${input.owner} through #${inviteChannel}, wait for them to join, hand the server over, and write its id into ${input.loaded.filepath}`)}`
		);
		print("");
		print(style.header("0 ok, 0 fail, 1 skipped"));
		return { status: "dry-run" };
	}

	const report: NotificationsCreateServerReport = { status: "ok" };
	let ok = 0;
	const step = (line: string) => {
		print(`  ${style.success(line)}`);
		ok++;
	};

	try {
		if (!input.resume) {
			const made = await notifications.createServer!({
				name: input.name!,
				...(input.force ? { force: true } : {}),
			});
			report.serverId = made.id;
			step(`created the server "${made.name}" (${made.id})`);

			// Written before anything else can fail, so a later step can be picked up from the config.
			const written = await writeGuildId(input.loaded.filepath, made.id);
			report.configUpdated = written.written;
			if (written.written) step(`wrote the server id into ${input.loaded.filepath}`);
			else
				print(
					`  ${style.fail(`could not update the config: ${written.reason}. Set guildId to ${made.id} by hand.`)}`
				);

			const setup = await (input.runSetup ?? runNotificationsSetup)({
				loaded: input.loaded,
				context: input.context,
				loader,
				print,
				logger,
				...(input.provider ? { provider: input.provider } : {}),
			});
			if (setup.status === "fail") {
				return refuse(
					`the server was created (${made.id}) but applying the layout failed; fix it and run \`holocron notifications setup\` (the bot still owns the server)`
				);
			}
			ok++;
		}

		const invite = await notifications.inviteLink!(inviteChannel);
		report.invite = invite;
		step(`invite for member ${input.owner} (one use, valid for a day): ${invite}`);

		const waitMs = input.waitMs ?? 15 * 60_000;
		const pollMs = input.pollMs ?? 5_000;
		print(
			`  ${style.skip(`waiting for member ${input.owner} to join (up to ${Math.round(waitMs / 60_000)} minutes)…`)}`
		);
		let waited = 0;
		while (!(await notifications.hasMember!(input.owner))) {
			if (waited >= waitMs) {
				return refuse(
					`member ${input.owner} did not join in time; the server is ready and still owned by the bot. Open the invite, then run \`holocron notifications create-server --resume --owner ${input.owner}\``
				);
			}
			await sleep(pollMs);
			waited += pollMs;
		}
		step(`member ${input.owner} joined`);

		await notifications.transferServer!(input.owner);
		step(`handed the server to member ${input.owner}`);
	} catch (err) {
		return refuse(describeProviderError(err), logReason(err));
	}

	print("");
	print(style.header(`${ok} ok, 0 fail, 0 skipped`));
	logger.info({ serverId: report.serverId }, "notifications create-server");
	return report;
}
