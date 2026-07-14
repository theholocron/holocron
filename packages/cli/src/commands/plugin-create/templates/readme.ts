import type { TemplateInputs } from "../template-inputs.js";

export function render(inputs: TemplateInputs): string {
	return `<!-- editorconfig-checker-disable-file -->

# \`@theholocron/holocron-plugin-${inputs.slug}\`

${inputs.vendorName} plugin for [Holocron](../cli). Implements the
\`${inputs.capability}\` capability against [${inputs.vendorName}'s REST API](${inputs.baseUrl}),
plus exports \`verifyToken\` + \`AUTH_HINT\` for use by \`holocron auth\`.

## Install

\`\`\`bash
pnpm add -D @theholocron/holocron-plugin-${inputs.slug}@alpha
\`\`\`

## Auth

Token resolution order (matches the standard 4-step precedence set by
\`.notes/tech-auth-bootstrap.spec.md\`):

1. \`--token <TOKEN>\` flag on the holocron invocation
2. \`${inputs.tokenEnv}\` env var (preferred — explicit intent)
3. \`${inputs.vendorEnv}\` env var (${inputs.vendorName}-native)
4. **Keyring** — \`com.theholocron.cli\` service, account \`${inputs.slug}\`
5. \`AuthError\` naming all four options + the bootstrap hint

## Setup

\`\`\`bash
# Generate a ${inputs.vendorName} API token (see vendor docs), then:
holocron auth set ${inputs.slug} <TOKEN>
holocron auth check ${inputs.slug}    # verify
\`\`\`

## Config

\`\`\`jsonc
{
	"providers": {
		"${inputs.capability}": "${inputs.slug}",
	},
}
\`\`\`

Plugin options extend \`ResolveTokenInput\` — add whatever ${inputs.vendorName}-
specific options you need here (project id, workspace slug, etc.) via
the tuple form:

\`\`\`jsonc
{
	"providers": {
		"${inputs.capability}": ["${inputs.slug}", { "baseUrl": "${inputs.baseUrl}" }],
	},
}
\`\`\`

## What's implemented

TODO: fill in as capability methods land.

## Status

**\`v2.0.0-alpha.1\`** — scaffolded via \`holocron plugin create\`.
Not yet published; capability methods are stubs.
`;
}
