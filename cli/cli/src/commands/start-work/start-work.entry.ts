import { type MenuEntry } from "@theholocron/kyber/menu";

export const startWorkEntry: MenuEntry = {
	name: "start work",
	description: "Start work on an issue: branch, worktree, first commit, push and a draft pull request",
	positionals: [{ key: "issue", message: "Issue (#1234, owner/repo#1234 or the tracker's key):", type: "input" }],
	options: [
		{ key: "name", flag: "--name", type: "input", message: "Branch and worktree name (kebab-case):" },
		{ key: "title", flag: "--title", type: "input", message: "Pull request title (a Conventional Commit line):" },
		{ key: "base", flag: "--base", type: "input", message: "Base branch:" },
		{ key: "spec", flag: "--spec", type: "input", message: "Spec file (the first commit):" },
		{ key: "onePr", flag: "--one-pr", type: "confirm", message: "One pull request for the spec and the code?" },
		{ key: "type", flag: "--type", type: "select", choices: ["bug", "feature", "task"], message: "Kind of issue:" },
		{ key: "effort", flag: "--effort", type: "select", choices: ["high", "medium", "low"], message: "Effort:" },
		{ key: "project", flag: "--project", type: "input", message: "Board for the pull request:" },
	],
	skipOptions: ["yes", "worktree", "worktree-path", "assignee", "pr"],
	supportsDryRun: true,
};
