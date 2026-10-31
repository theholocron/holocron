import type { NotificationsLayout } from "../../plugin/index.js";
import { defaultSecretName } from "./notifications-channel-add.js";

/**
 * The names of the secrets a layout fills: each channel's webhook secret (`webhook.secret`, else the name derived
 * from the channel) and each role's `secret`. In the order the layout declares them.
 */
export function layoutSecretNames(layout: NotificationsLayout): string[] {
	const fromChannels = (layout.categories ?? []).flatMap((category) =>
		(category.channels ?? [])
			.filter((channel) => channel.webhook)
			.map((channel) =>
				channel.webhook !== true && channel.webhook && channel.webhook.secret
					? channel.webhook.secret
					: defaultSecretName(channel.name)
			)
	);
	const fromRoles = (layout.roles ?? []).flatMap((role) => (role.secret ? [role.secret] : []));
	return [...fromChannels, ...fromRoles];
}
