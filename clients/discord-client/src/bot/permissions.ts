/**
 * Discord permission bits, by the names the Discord docs use. Permissions travel as
 * decimal strings because they overflow a JS number's safe integer range. Bits Discord
 * adds after this list are not named here: `permissionNames` leaves them out, and
 * `permissions` cannot set them by name.
 */
export const Permission = {
	/** Create invites to the server. */
	CreateInstantInvite: 1n << 0n,
	/** Kick members. */
	KickMembers: 1n << 1n,
	/** Ban members. */
	BanMembers: 1n << 2n,
	/** Administrator: all permissions, and bypasses channel overrides. */
	Administrator: 1n << 3n,
	/** Create, edit and delete channels. */
	ManageChannels: 1n << 4n,
	/** Change server settings. */
	ManageGuild: 1n << 5n,
	/** Add new reactions to messages. */
	AddReactions: 1n << 6n,
	/** View the audit log. */
	ViewAuditLog: 1n << 7n,
	/** Use priority speaker in voice channels. */
	PrioritySpeaker: 1n << 8n,
	/** Go live (stream) in voice channels. */
	Stream: 1n << 9n,
	/** View channels (and read their messages). */
	ViewChannel: 1n << 10n,
	/** Send messages in text channels. */
	SendMessages: 1n << 11n,
	/** Send text-to-speech messages. */
	SendTtsMessages: 1n << 12n,
	/** Delete other members' messages and pin messages. */
	ManageMessages: 1n << 13n,
	/** Have links in messages embed. */
	EmbedLinks: 1n << 14n,
	/** Upload files and media. */
	AttachFiles: 1n << 15n,
	/** Read message history. */
	ReadMessageHistory: 1n << 16n,
	/** Mention @everyone, @here and all roles. */
	MentionEveryone: 1n << 17n,
	/** Use emojis from other servers. */
	UseExternalEmojis: 1n << 18n,
	/** View server insights. */
	ViewGuildInsights: 1n << 19n,
	/** Join voice channels. */
	Connect: 1n << 20n,
	/** Speak in voice channels. */
	Speak: 1n << 21n,
	/** Mute other members in voice channels. */
	MuteMembers: 1n << 22n,
	/** Deafen other members in voice channels. */
	DeafenMembers: 1n << 23n,
	/** Move members between voice channels. */
	MoveMembers: 1n << 24n,
	/** Use voice activity detection instead of push-to-talk. */
	UseVoiceActivity: 1n << 25n,
	/** Change one's own nickname. */
	ChangeNickname: 1n << 26n,
	/** Change other members' nicknames. */
	ManageNicknames: 1n << 27n,
	/** Create, edit and delete roles lower than the member's own. */
	ManageRoles: 1n << 28n,
	/** Create, edit and delete webhooks. */
	ManageWebhooks: 1n << 29n,
	/** Edit and delete emojis, stickers and soundboard sounds. */
	ManageGuildExpressions: 1n << 30n,
	/** Use application commands (slash commands). */
	UseApplicationCommands: 1n << 31n,
	/** Request to speak in stage channels. */
	RequestToSpeak: 1n << 32n,
	/** Edit and delete scheduled events. */
	ManageEvents: 1n << 33n,
	/** Manage and delete threads. */
	ManageThreads: 1n << 34n,
	/** Create public threads. */
	CreatePublicThreads: 1n << 35n,
	/** Create private threads. */
	CreatePrivateThreads: 1n << 36n,
	/** Use stickers from other servers. */
	UseExternalStickers: 1n << 37n,
	/** Send messages in threads. */
	SendMessagesInThreads: 1n << 38n,
	/** Start activities in voice channels. */
	UseEmbeddedActivities: 1n << 39n,
	/** Time out members. */
	ModerateMembers: 1n << 40n,
	/** View creator monetization analytics. */
	ViewCreatorMonetizationAnalytics: 1n << 41n,
	/** Use soundboard sounds. */
	UseSoundboard: 1n << 42n,
	/** Create emojis, stickers and soundboard sounds. */
	CreateGuildExpressions: 1n << 43n,
	/** Create scheduled events. */
	CreateEvents: 1n << 44n,
	/** Use soundboard sounds from other servers. */
	UseExternalSounds: 1n << 45n,
	/** Send voice messages. */
	SendVoiceMessages: 1n << 46n,
	/** Send polls. */
	SendPolls: 1n << 49n,
	/** Use apps that are not installed in the server. */
	UseExternalApps: 1n << 50n,
	/** Pin and unpin messages. */
	PinMessages: 1n << 51n,
} as const;

/** The name of one entry in `Permission`. */
export type PermissionName = keyof typeof Permission;

/** The decimal-string bitfield Discord wants for the named permissions (`"0"` for none). */
export function permissions(names: readonly PermissionName[]): string {
	let bits = 0n;
	for (const name of names) {
		const bit = Permission[name];
		if (bit === undefined) throw new Error(`unknown Discord permission: ${JSON.stringify(name)}`);
		bits |= bit;
	}
	return bits.toString();
}

/** The permission names set in a bitfield, in declaration order (unknown bits are ignored). */
export function permissionNames(bitfield: string): PermissionName[] {
	if (!/^\d{1,20}$/.test(bitfield)) throw new Error(`invalid permission bitfield: ${JSON.stringify(bitfield)}`);
	const bits = BigInt(bitfield);
	return (Object.keys(Permission) as PermissionName[]).filter((name) => (bits & Permission[name]) !== 0n);
}
