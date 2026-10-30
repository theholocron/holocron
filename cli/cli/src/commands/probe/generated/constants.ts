/**
 * Workflow files that no task generates and that are not marked `# HAND-MAINTAINED`, so the check would take them for
 * stale generated files. Each is intentional.
 */
export const UNMANAGED_WORKFLOWS: Readonly<Record<string, string>> = {
	// Committed with the registry entry, ahead of the task being added to the config: Sentinel checks task names
	// against its own deployed build, so the name can only be listed once a release has shipped it (astromech.config.ts).
	"platform.syncTemplates.yml": "its task is not in the config yet, on purpose (see astromech.config.ts)",
};
