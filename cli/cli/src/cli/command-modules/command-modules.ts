import type { CommandModule } from "yargs";

import { applyCommand } from "../../commands/apply/index.js";
import { checkCommand } from "../../commands/check/index.js";
import { cleanupCommand } from "../../commands/cleanup/index.js";
import { cloneCommand } from "../../commands/clone/clone.command.js";
import { closeCommand } from "../../commands/close/index.js";
import { deployCommand } from "../../commands/deploy/deploy.command.js";
import { devCommand } from "../../commands/dev/index.js";
import { doctorCommand } from "../../commands/doctor/index.js";
import { exportCommand } from "../../commands/export/index.js";
import { installCommand } from "../../commands/install/index.js";
import { linkCommand } from "../../commands/link/index.js";
import { listCommand } from "../../commands/list/index.js";
import { migrateCommand } from "../../commands/migrate/index.js";
import { moveCommand } from "../../commands/move/index.js";
import { newCommand } from "../../commands/new/new.command.js";
import { probeCommand } from "../../commands/probe/index.js";
import { providerCommand } from "../../commands/provider/index.js";
import { publishCommand } from "../../commands/publish/publish.command.js";
import { reconcileCommand } from "../../commands/reconcile/index.js";
import { removeCommand } from "../../commands/remove/index.js";
import { resolveCommand } from "../../commands/resolve/index.js";
import { runCommand } from "../../commands/run/run.command.js";
import { setupCommand } from "../../commands/setup/setup.command.js";
import { showCommand } from "../../commands/show/index.js";
import { syncCommand } from "../../commands/sync/sync.command.js";
import { updateCommand } from "../../commands/update/index.js";
import { upgradeCommand } from "../../commands/upgrade/index.js";
import { uploadCommand } from "../../commands/upload/index.js";

/**
 * Every top-level command module the binary registers, in the order its help lists them (the menu, which needs the
 * CLI's version, is registered beside them in `cli.ts`). One list, so the binary and the tests that walk the command
 * surface (the menu's option drift guard) cannot disagree about what is registered.
 */
export const COMMAND_MODULES = [
	cloneCommand,
	doctorCommand,
	installCommand,
	updateCommand,
	runCommand,
	showCommand,
	checkCommand,
	exportCommand,
	uploadCommand,
	setupCommand,
	upgradeCommand,
	cleanupCommand,
	applyCommand,
	newCommand,
	listCommand,
	removeCommand,
	probeCommand,
	providerCommand,
	linkCommand,
	closeCommand,
	moveCommand,
	migrateCommand,
	devCommand,
	syncCommand,
	publishCommand,
	deployCommand,
	resolveCommand,
	reconcileCommand,
] as unknown as CommandModule[];
