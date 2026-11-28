import type { WorkBodyInput } from "./work-body.type.js";

/**
 * The first body of the work's pull request: the links to the issue and the spec file and the four definition-of-done
 * items as a checklist. The `Closes` or `Refs` line is not here; the provider adds it from the pull request's link.
 */
export function buildWorkBody(input: WorkBodyInput): string {
	const issue = input.issueUrl ? `[${input.issue}](${input.issueUrl})` : input.issue;
	return [
		`Issue: ${issue} ${input.issueTitle}`,
		input.spec ? `Spec: \`${input.spec}\`` : "Spec: none; the issue's text is the spec",
		"",
		"## Definition of done",
		"",
		"- [ ] Code",
		"- [ ] Tests",
		"- [ ] Docs",
		"- [ ] Green checks (`ci / Required checks`)",
	].join("\n");
}
