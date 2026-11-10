import { parseStates } from "../settings/parse-states.js";
import { buildSyncCommand } from "./build-sync-command.js";
import { decideFileable } from "./decide-fileable.js";
import { decideTrash } from "./decide-trash.js";
import type { FileIdeaDeps } from "./filing.type.js";
import { tailOutput } from "./tail-output.js";

/**
 * File this idea. The order is the safety property: the state is set first, `ideas sync` runs, and the note is
 * trashed only when it is read back with an `issue:`. A command that exits non-zero, cannot start or leaves no
 * `issue:` keeps the note, and nothing is restored. On mobile there is no shell, so it only sets the state.
 */
export async function fileIdea(deps: FileIdeaDeps): Promise<void> {
	const { settings, notify } = deps;
	const { fileState } = parseStates(settings);

	const fileable = decideFileable(await deps.readNote(), fileState);
	if (!fileable.ok) {
		notify(fileable.reason);
		return;
	}

	if (deps.isMobile) {
		await deps.setStatus(fileState);
		notify(`Set to ${fileState}. It will be filed the next time a Mac runs File this idea.`);
		return;
	}

	// Everything the run needs is checked before the note is touched, so a missing setting changes nothing.
	if (settings.repoPath.trim() === "") {
		notify("Set the Holocron repo path in the plugin's settings first.");
		return;
	}
	if (deps.vaultPath === undefined) {
		notify("This vault is not a folder on this computer, so it cannot be filed here.");
		return;
	}
	const command = buildSyncCommand(settings, deps.vaultPath, deps.currentPath, deps.system());
	if (command === undefined) {
		notify("The command setting is empty.");
		return;
	}

	await deps.setStatus(fileState);
	if (command.unsupportedShell !== undefined) {
		notify(
			`The login shell (${command.unsupportedShell}) is not supported, so the command ran directly. ` +
				"The Command setting may need full paths."
		);
	}
	deps.announce("Filing the idea… starting your shell can take a few seconds.");
	const result = await deps.run(command);
	const tail = tailOutput(result.output);
	if (result.code !== 0) {
		const why = result.error ?? `The command exited with ${String(result.code)}.`;
		notify(`Not filed; the note was kept. ${why}${tail === "" ? "" : `\n${tail}`}`);
		return;
	}

	const decision = decideTrash(await deps.readNote(), tail);
	if (!decision.trash) {
		notify(decision.reason);
		return;
	}
	await deps.trashNote();
	notify(`Filed as ${decision.issue}; the note is in the trash.`);
}
