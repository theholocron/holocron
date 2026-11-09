import { createCommandRegistry } from "@theholocron/kyber/menu";

import { authCheckEntry } from "../../commands/auth/auth-check.entry.js";
import { authListEntry } from "../../commands/auth/auth-list.entry.js";
import { authSetEntry } from "../../commands/auth/auth-set.entry.js";
import { authUnsetEntry } from "../../commands/auth/auth-unset.entry.js";
import { authExportEntry } from "../../commands/auth-export/auth-export.entry.js";
import { cleanupPreviewEntry } from "../../commands/cleanup-preview/cleanup-preview.entry.js";
import { cloneEntry } from "../../commands/clone/clone.entry.js";
import { configShowEntry } from "../../commands/config-show/config-show.entry.js";
import { deployEntry } from "../../commands/deploy/deploy.entry.js";
import { deployOnReleaseEntry } from "../../commands/deploy/deploy-on-release.entry.js";
import { doctorEntry } from "../../commands/doctor/doctor.entry.js";
import { doctorAllEntry } from "../../commands/doctor/doctor-all.entry.js";
import { doctorCiEntry } from "../../commands/doctor-ci/doctor-ci.entry.js";
import { doctorCredentialsEntry } from "../../commands/doctor-credentials/doctor-credentials.entry.js";
import { doctorDnsEntry } from "../../commands/doctor-dns/doctor-dns.entry.js";
import { doctorEnvironmentsEntry } from "../../commands/doctor-environments/doctor-environments.entry.js";
import { doctorGitHubAppEntry } from "../../commands/doctor-github-app/doctor-github-app.entry.js";
import { doctorLogsEntry } from "../../commands/doctor-logs/doctor-logs.entry.js";
import { doctorMonitoringEntry } from "../../commands/doctor-monitoring/doctor-monitoring.entry.js";
import { doctorNotificationsEntry } from "../../commands/doctor-notifications/doctor-notifications.entry.js";
import { doctorProjectEntry } from "../../commands/doctor-project/doctor-project.entry.js";
import { doctorRepoEntry } from "../../commands/doctor-repo/doctor-repo.entry.js";
import { doctorSecretsEntry } from "../../commands/doctor-secrets/doctor-secrets.entry.js";
import { doctorTokensEntry } from "../../commands/doctor-tokens/doctor-tokens.entry.js";
import { doctorVariablesEntry } from "../../commands/doctor-variables/doctor-variables.entry.js";
import { githubAppCreateEntry } from "../../commands/github-app-create/github-app-create.entry.js";
import { ideasSyncEntry } from "../../commands/ideas-sync/ideas-sync.entry.js";
import { migrateIssueEntry } from "../../commands/migrate/migrate-issue/migrate-issue.entry.js";
import { migrateIssuesEntry } from "../../commands/migrate/migrate-issues/migrate-issues.entry.js";
import { migrateProjectEntry } from "../../commands/migrate/migrate-project/migrate-project.entry.js";
import { monitoringCheckEntry } from "../../commands/monitoring-check/monitoring-check.entry.js";
import { moveTagEntry } from "../../commands/move-tag/move-tag.entry.js";
import { newRepoEntry } from "../../commands/new/new-repo.entry.js";
import { notificationsChannelAddEntry } from "../../commands/notifications-channel-add/notifications-channel-add.entry.js";
import { notificationsCreateServerEntry } from "../../commands/notifications-create-server/notifications-create-server.entry.js";
import { notificationsLinkEntry } from "../../commands/notifications-link/notifications-link.entry.js";
import { notificationsSetupEntry } from "../../commands/notifications-setup/notifications-setup.entry.js";
import { notificationsSyncRolesEntry } from "../../commands/notifications-sync-roles/notifications-sync-roles.entry.js";
import { npmBumpVersionsEntry } from "../../commands/npm-bump-versions/npm-bump-versions.entry.js";
import { pluginCreateEntry } from "../../commands/plugin-create/plugin-create.entry.js";
import { probeEntry } from "../../commands/probe/probe.entry.js";
import { projectMoveEntry } from "../../commands/project/move/move.entry.js";
import { projectCloseEntry } from "../../commands/project/project-close/project-close.entry.js";
import { projectCreateEntry } from "../../commands/project/project-create/project-create.entry.js";
import { projectListEntry } from "../../commands/project/project-list/project-list.entry.js";
import { projectSetupEntry } from "../../commands/project/project-setup/project-setup.entry.js";
import { projectReconcileEntry } from "../../commands/project/reconcile/reconcile.entry.js";
import { providerEntry } from "../../commands/provider/provider.entry.js";
import { publishEntry } from "../../commands/publish/publish.entry.js";
import { repoSyncEntry } from "../../commands/repo/repo-sync.entry.js";
import { repoCleanupBranchesEntry } from "../../commands/repo-cleanup-branches/repo-cleanup-branches.entry.js";
import { repoPropertiesApplyEntry } from "../../commands/repo-properties/repo-properties-apply.entry.js";
import { runCiEntry } from "../../commands/run/run-ci.entry.js";
import { secretSetEntry } from "../../commands/secret-set/secret-set.entry.js";
import { secretsListEntry } from "../../commands/secrets-list/secrets-list.entry.js";
import { secretsSyncEntry } from "../../commands/secrets-sync/secrets-sync.entry.js";
import { setupEntry } from "../../commands/setup/setup.entry.js";
import { skillsInstallEntry } from "../../commands/skills/skills-install.entry.js";
import { skillsRemoveEntry } from "../../commands/skills/skills-remove.entry.js";
import { skillsUpdateEntry } from "../../commands/skills/skills-update.entry.js";
import { specsSyncEntry } from "../../commands/specs-sync/specs-sync.entry.js";
import { syncGithubEntry } from "../../commands/sync-github/sync-github.entry.js";
import { syncIssuesEntry } from "../../commands/sync-issues/sync-issues.entry.js";
import { syncReadmeEntry } from "../../commands/sync-readme/sync-readme.entry.js";
import { tunnelUpEntry } from "../../commands/tunnel-up/tunnel-up.entry.js";
import { upgradeDepsEntry } from "../../commands/upgrade-deps/upgrade-deps.entry.js";
import { upgradeNodeEntry } from "../../commands/upgrade-node/upgrade-node.entry.js";

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
const registry = createCommandRegistry(
	[
		cloneEntry,
		doctorEntry,
		doctorAllEntry,
		probeEntry,
		providerEntry,
		setupEntry,
		secretSetEntry,
		secretsListEntry,
		secretsSyncEntry,
		notificationsChannelAddEntry,
		doctorMonitoringEntry,
		doctorNotificationsEntry,
		doctorEnvironmentsEntry,
		doctorCredentialsEntry,
		doctorProjectEntry,
		doctorGitHubAppEntry,
		doctorLogsEntry,
		projectMoveEntry,
		repoPropertiesApplyEntry,
		migrateIssueEntry,
		migrateIssuesEntry,
		migrateProjectEntry,
		doctorDnsEntry,
		doctorRepoEntry,
		doctorSecretsEntry,
		doctorTokensEntry,
		doctorVariablesEntry,
		doctorCiEntry,
		notificationsSetupEntry,
		notificationsCreateServerEntry,
		notificationsLinkEntry,
		notificationsSyncRolesEntry,
		specsSyncEntry,
		deployEntry,
		cleanupPreviewEntry,
		deployOnReleaseEntry,
		monitoringCheckEntry,
		npmBumpVersionsEntry,
		moveTagEntry,
		publishEntry,
		repoSyncEntry,
		repoCleanupBranchesEntry,
		runCiEntry,
		syncGithubEntry,
		syncIssuesEntry,
		ideasSyncEntry,
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
		authExportEntry,
		githubAppCreateEntry,
		tunnelUpEntry,
		// project: one entry per subcommand of `holocron project`; add new ones here.
		projectListEntry,
		projectCreateEntry,
		projectCloseEntry,
		projectSetupEntry,
		// project (SPEC-0020)
		projectReconcileEntry,
	],
	"interactive-menu"
);

/** Every Holocron command, in menu order: what {@link launchMenu} lists and what a leaf handler's prompt reads. */
export const COMMAND_REGISTRY = registry.entries;

/** Look up a command's menu entry by its full name — for Layer 3 call sites in `cli.ts`. */
export const getEntry = registry.getEntry;
