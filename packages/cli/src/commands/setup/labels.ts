export const CANONICAL_LABELS = [
	{ name: "bug", color: "d73a4a", description: "Something isn't working" },
	{ name: "chore", color: "ededed", description: "Maintenance, no user-facing change" },
	{ name: "ci", color: "0075ca", description: "CI/CD pipeline changes" },
	{ name: "dependencies", color: "0366d6", description: "Dependency update" },
	{ name: "documentation", color: "0075ca", description: "Documentation only" },
	{ name: "duplicate", color: "cfd3d7", description: "Already reported" },
	{ name: "enhancement", color: "a2eeef", description: "New feature or request" },
	{ name: "good first issue", color: "7057ff", description: "Good for newcomers" },
	{ name: "help wanted", color: "008672", description: "Extra attention needed" },
	{ name: "invalid", color: "e4e669", description: "Doesn't seem right" },
	{ name: "performance", color: "fbca04", description: "Performance improvement" },
	{ name: "question", color: "d876e3", description: "Further information requested" },
	{ name: "refactor", color: "cfd3d7", description: "Code restructuring" },
	{ name: "released", color: "ededed", description: "Included in a release" },
	{ name: "test", color: "bfd4f2", description: "Test-related changes" },
	{ name: "triage", color: "e4e669", description: "Needs investigation" },
	{ name: "wontfix", color: "ffffff", description: "Won't be addressed" },
] as const;

export const STALE_LABELS = [
	"github_actions",
	"javascript",
	"autorelease: pending",
	"autorelease: tagged",
	"released on @alpha",
];
