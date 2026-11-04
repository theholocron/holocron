import {
	createAstromech,
	generateThinCallerContent,
	hostedReusableWorkflows,
	KNOWN_WORKFLOWS,
	legacyCaller,
	legacyCallerFile,
	legacyGate,
	legacyWorkflowKey,
	localize,
	resolveTaskName,
	TASKS,
	workflowFile,
	workflowKey,
	workflowKeys,
} from "@theholocron/astromech";
import type { TasksConfig } from "@theholocron/astromech/config";
import { findRootSync } from "@theholocron/fs-utils";

import { getLogger } from "../../observability/logger/index.js";
import { withAutoPreviewDeployPaths } from "../preview-deploy-paths/index.js";
import { thinCallerFile } from "../thin-caller-file/index.js";
import { resolvePkgRelPath } from "../workflow-source-marker/index.js";
import { HOSTED_CALLER_PREFIX, hostedReusableFile, hostsReusables } from "./hosted-reusables.js";
import type { GeneratedWorkflowFile, RepoFilesInput, SkippedRepoFile } from "./repo-files.type.js";

/**
 * The thin-caller workflow for each task in the manifest, in the manifest's order. A task with no template is a
 * skipped entry, and a task with `ci: false` has no file. Nothing here is remote: astromech renders every file from the
 * manifest (the linter set, deploy paths, deploy and preview), and a bad manifest throws.
 *
 * In the repo that hosts the reusables (it has the `@theholocron/ci` package) every config's callers are named for their
 * task id, in the workflow, the job and the file (`ci.test-unit.yml`, the id with its colon a hyphen), and call
 * `./.github/workflows/<flat name>.yml`; the root config also writes the reusables beside them. Every other repo
 * still calls the frozen reusables in `theholocron/.github`, so while that is so (`legacyGate()`) its callers keep the
 * names they had (`verification.unitTests.yml`, workflow `Verification`): its ruleset lists the checks they post.
 */
export function generateWorkflowFiles(input: RepoFilesInput): (GeneratedWorkflowFile | SkippedRepoFile)[] {
	const config = input.loaded.resolved;
	if (!config.tasks || config.tasks.length === 0) return [];

	// Stamped into every workflow so a second subpackage that opts into the same task name is caught as a collision
	// (holocron#1026), derived from the config's own directory rather than `--cwd`.
	const gitRoot = findRootSync(input.repoRoot, ".git", { fallback: "start", realpath: true }) as string;
	const pkgRelPath = resolvePkgRelPath(gitRoot, input.loaded.filepath);
	// A previewDeploy with a non-root cwd and no `with.paths` gets one from its workspace dependencies (holocron#1023).
	const tasks = withAutoPreviewDeployPaths(config.tasks, gitRoot);
	const astromech = createAstromech({
		cwd: input.repoRoot,
		config: { tasks: tasks as TasksConfig["tasks"], extraRequiredChecks: config.extraRequiredChecks },
		orgContext: { org: config.org, domain: config.domain },
		logger: input.logger ?? getLogger(),
	});
	const files = astromech.thinCallers();

	// A package's own config (apps/sentinel) generates callers with the reusables' names too, so all of them move.
	const hosting = hostsReusables(gitRoot);

	const legacy = !hosting && legacyGate();

	const entries: (GeneratedWorkflowFile | SkippedRepoFile)[] = [];
	// One caller per workflow an entry needs (`validate` has two). A task with no workflow of its own (`format`, a step of
	// `lint:code`) writes none. A repo on the legacy gate has one caller for what is now several workflows (the formatting
	// ones, the validate ones), filed under the first: the frozen reusable runs them all.
	const wanted = tasks.flatMap((entry) => {
		const name = typeof entry === "string" ? entry : entry.name;
		const ids = resolveTaskName(name);
		if (ids.length > 0 && ids.every(({ id }) => TASKS[id]?.workflow === false)) return [];
		return (legacy ? [legacyWorkflowKey(name)] : workflowKeys(name)).map((key) => ({ entry, name, key }));
	});
	for (const { entry, name, key } of wanted) {
		// deploy-docs / deploy-components have no static template: their content is always generated.
		const isCombinedContentOnly = key === "deploy-docs" || key === "deploy-components";
		if (!KNOWN_WORKFLOWS.has(key) && !isCombinedContentOnly) {
			entries.push({
				kind: "skip",
				step: `write workflow ${name}`,
				syncStep: `sync workflow ${name}`,
				message: `unknown workflow "${name}" — no template available`,
			});
			continue;
		}

		// Keyed by task id alone, whichever package's config generated it.
		let flat = files.get(`${key}.yml`);
		// `lint:markdown` listed without `lint:editorconfig` still needs the one formatting caller (generated under its own key)
		if (
			flat === undefined &&
			legacy &&
			key !== workflowKey(name) &&
			!(typeof entry === "object" && entry.ci === false)
		) {
			flat = generateThinCallerContent(key);
		}
		if (flat === undefined) continue; // ci: false, or no workflow of its own — nothing to write
		const content = legacy ? legacyCaller(key, flat) : flat;
		const filename = hosting
			? `${HOSTED_CALLER_PREFIX}${workflowFile(key)}`
			: legacy
				? legacyCallerFile(key)
				: workflowFile(key);

		const preview = content.includes("workflows/preview.yml@main") ? " (with preview)" : "";
		entries.push({
			kind: "file",
			path: `.github/workflows/${filename}`,
			content: thinCallerFile(pkgRelPath, hosting ? localize(content) : content),
			step: `write workflow ${name}${preview}`,
			syncStep: `sync workflow ${name}${preview}`,
			workflow: { task: key, filename },
		});
	}

	// Written once, by the root config; a package's config would stamp them with its own `# Source package:`.
	if (hosting && pkgRelPath === ".") {
		// The `ci` aggregate (#1613): one caller that waits on everything the manifest marks required. Only here, in the
		// repo that hosts `ci.yml`; the other repos call frozen copies that have none until `CI_HOME` moves.
		const aggregate = astromech.aggregateCaller();
		if (aggregate !== null) {
			const filename = `${HOSTED_CALLER_PREFIX}ci.yml`;
			entries.push({
				kind: "file",
				path: `.github/workflows/${filename}`,
				content: thinCallerFile(pkgRelPath, localize(aggregate)),
				step: "write workflow ci",
				syncStep: "sync workflow ci",
				workflow: { task: "ci", filename },
			});
		}
		for (const [id, content] of hostedReusableWorkflows()) {
			const filename = workflowFile(id);
			entries.push({
				kind: "file",
				path: `.github/workflows/${filename}`,
				content: hostedReusableFile(id, content),
				step: `write reusable workflow ${id}`,
				syncStep: `sync reusable workflow ${id}`,
				workflow: { task: id, filename },
			});
		}
	}
	return entries;
}
