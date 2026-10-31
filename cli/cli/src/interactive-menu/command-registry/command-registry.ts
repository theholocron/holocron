import { authCheckEntry } from "../../commands/auth/auth-check.entry.js";
import { authListEntry } from "../../commands/auth/auth-list.entry.js";
import { authSetEntry } from "../../commands/auth/auth-set.entry.js";
import { authUnsetEntry } from "../../commands/auth/auth-unset.entry.js";
import { cleanupPreviewEntry } from "../../commands/cleanup-preview/cleanup-preview.entry.js";
import { cloneEntry } from "../../commands/clone/clone.entry.js";
import { configShowEntry } from "../../commands/config-show/config-show.entry.js";
import { deployEntry } from "../../commands/deploy/deploy.entry.js";
import { deployOnReleaseEntry } from "../../commands/deploy/deploy-on-release.entry.js";
import { doctorEntry } from "../../commands/doctor/doctor.entry.js";
import { doctorAllEntry } from "../../commands/doctor/doctor-all.entry.js";
import { doctorNotificationsEntry } from "../../commands/doctor-notifications/doctor-notifications.entry.js";
import { doctorVariablesEntry } from "../../commands/doctor-variables/doctor-variables.entry.js";
import { monitoringCheckEntry } from "../../commands/monitoring-check/monitoring-check.entry.js";
import { newRepoEntry } from "../../commands/new/new-repo.entry.js";
import { notificationsChannelAddEntry } from "../../commands/notifications-channel-add/notifications-channel-add.entry.js";
import { notificationsCreateServerEntry } from "../../commands/notifications-create-server/notifications-create-server.entry.js";
import { notificationsLinkEntry } from "../../commands/notifications-link/notifications-link.entry.js";
import { notificationsSetupEntry } from "../../commands/notifications-setup/notifications-setup.entry.js";
import { notificationsSyncRolesEntry } from "../../commands/notifications-sync-roles/notifications-sync-roles.entry.js";
import { npmBumpVersionsEntry } from "../../commands/npm-bump-versions/npm-bump-versions.entry.js";
import { pluginCreateEntry } from "../../commands/plugin-create/plugin-create.entry.js";
import { probeEntry } from "../../commands/probe/probe.entry.js";
import { publishEntry } from "../../commands/publish/publish.entry.js";
import { repoSyncEntry } from "../../commands/repo/repo-sync.entry.js";
import { repoCleanupBranchesEntry } from "../../commands/repo-cleanup-branches/repo-cleanup-branches.entry.js";
import { runCiEntry } from "../../commands/run/run-ci.entry.js";
import { secretSetEntry } from "../../commands/secret-set/secret-set.entry.js";
import { secretsListEntry } from "../../commands/secrets-list/secrets-list.entry.js";
import { secretsSyncEntry } from "../../commands/secrets-sync/secrets-sync.entry.js";
import { setupEntry } from "../../commands/setup/setup.entry.js";
import { skillsInstallEntry } from "../../commands/skills/skills-install.entry.js";
import { skillsRemoveEntry } from "../../commands/skills/skills-remove.entry.js";
import { skillsUpdateEntry } from "../../commands/skills/skills-update.entry.js";
import { syncGithubEntry } from "../../commands/sync-github/sync-github.entry.js";
import { syncReadmeEntry } from "../../commands/sync-readme/sync-readme.entry.js";
import { upgradeDepsEntry } from "../../commands/upgrade-deps/upgrade-deps.entry.js";
import { upgradeNodeEntry } from "../../commands/upgrade-node/upgrade-node.entry.js";
import type { CommandEntry } from "./command-registry.type.js";

/**
 * The full command surface for the interactive menu. Each entry lives next to the command it describes
 * (`commands/<name>/<name>.entry.ts`) and is listed here in menu order; this module does not introspect yargs at runtime.
 * `run <task>` has no entry of its own: the bare-`holocron` menu merges in {@link buildRunMenuEntries}'s dynamically-built
 * ones instead, since the task namespace is this repo's own resolved manifest, not a static set this module can
 * enumerate. `job` and `passthrough` stay un-prompted either way; picking a task and running it plain covers the
 * common case, and typing `holocron run <task> <job> -- <args>` directly is one step away for everything else.
 * `run lint commit-msg <file>` stays excluded entirely: it's invoked exclusively from `.husky/commit-msg "$1"`, never
 * typed by a human.
 */
export const COMMAND_REGISTRY: CommandEntry[] = [
	cloneEntry,
	doctorEntry,
	doctorAllEntry,
	probeEntry,
	setupEntry,
	secretSetEntry,
	secretsListEntry,
	secretsSyncEntry,
	notificationsChannelAddEntry,
	doctorNotificationsEntry,
	doctorVariablesEntry,
	notificationsSetupEntry,
	notificationsCreateServerEntry,
	notificationsLinkEntry,
	notificationsSyncRolesEntry,
	deployEntry,
	cleanupPreviewEntry,
	deployOnReleaseEntry,
	monitoringCheckEntry,
	npmBumpVersionsEntry,
	publishEntry,
	repoSyncEntry,
	repoCleanupBranchesEntry,
	runCiEntry,
	syncGithubEntry,
	syncReadmeEntry,
	configShowEntry,
	newRepoEntry,
	pluginCreateEntry,
	skillsInstallEntry,
	skillsRemoveEntry,
	skillsUpdateEntry,
	upgradeNodeEntry,
	upgradeDepsEntry,
	authSetEntry,
	authUnsetEntry,
	authCheckEntry,
	authListEntry,
];

/** Look up a {@link CommandEntry} by its full name — for Layer 3 call sites in `cli.ts`. */
export function getEntry(name: string): CommandEntry {
	const entry = COMMAND_REGISTRY.find((e) => e.name === name);
	if (!entry) throw new Error(`interactive-menu: no COMMAND_REGISTRY entry named "${name}"`);
	return entry;
}
