import type { ConfigDirArea } from "@theholocron/datapad";

import type { HolocronConfig } from "../../config/index.js";
import { placeNotifications } from "../place-notifications/index.js";
import { placeOrg } from "../place-org/index.js";
import { placeRepo } from "../place-repo/index.js";

/**
 * Put the area files of `.holocron/` into the config as loaded, before `deriveDefaults` runs: `notifications` becomes
 * the `layout` of the notifications provider and `repo` supplies keys of `repo` and `org` fills the provider options a config leaves out. A value set both inline and in a file
 * is a `ConfigError` naming both (no merge, no precedence). With no area files the config is returned as it was.
 */
export function placeAreas(areas: ConfigDirArea[], raw: HolocronConfig): HolocronConfig {
	let result = raw;
	for (const area of areas) {
		if (area.area === "notifications") result = placeNotifications(result, area);
		else if (area.area === "repo") result = placeRepo(result, area);
		else if (area.area === "org") result = placeOrg(result, area);
	}
	return result;
}
