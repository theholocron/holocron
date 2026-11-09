/**
 * Workflow files that no task generates and that are not marked `# HAND-MAINTAINED`, so the check would take them for
 * stale generated files. Each is intentional.
 */
export const UNMANAGED_WORKFLOWS: Readonly<Record<string, string>> = {};
