import type { CoverageConfigComponent, CoverageConfigDocumentation } from "@theholocron/cli";

import { CODECOV_TEMPLATE } from "./template.js";
import { applyStatusRules, INDIVIDUAL_COMPONENTS_MARKER } from "./yaml-rules.js";

/** What the generated `codecov.yml` depends on besides the component list. */
export interface CodecovConfigOptions {
	/** One Codecov flag name per package that has one, in order (the CLI decides which packages have a flag). */
	flags: string[];
	/** `repoValidation.docsCoverage`: `off` adds nothing about the documentation flag. */
	documentation: CoverageConfigDocumentation;
}

function scaffoldHeader(): string {
	return [
		`# Scaffolded by holocron setup — edit this file freely.`,
		`# Source:  theholocron/holocron · plugins/holocron-plugin-codecov/src/config-file/codecov-config.ts`,
		``,
	].join("\n");
}

/** The YAML list of components, one per package and grouped by workspace root, that `codecov.yml` carries. */
export function codecovComponentBlock(components: CoverageConfigComponent[]): string {
	if (components.length === 0) return "\n    []\n";
	let group: string | undefined;
	return (
		"\n" +
		components
			.flatMap(({ id, path }) => {
				const root = path.split("/")[0]!;
				const heading = root === group ? [] : [`    # ${root}`];
				group = root;
				return [
					...heading,
					`    - component_id: ${id}`,
					`      name: "${id}"`,
					`      paths:`,
					`        - ${path}/**`,
					``,
				];
			})
			.join("\n")
	);
}

/**
 * Brings an existing `codecov.yml` up to date with the components, the flags and the repo's options, keeping every hand
 * edit. A file with no `individual_components` list keeps its components as they are.
 */
export function mergeCodecovComponents(
	existing: string,
	components: CoverageConfigComponent[],
	options: CodecovConfigOptions
): string {
	const idx = existing.indexOf(INDIVIDUAL_COMPONENTS_MARKER);
	if (idx === -1) return applyStatusRules(existing, options.flags, options.documentation);
	return (
		applyStatusRules(
			existing.slice(0, idx + INDIVIDUAL_COMPONENTS_MARKER.length),
			options.flags,
			options.documentation
		) + codecovComponentBlock(components)
	);
}

/** A brand-new `codecov.yml`: the scaffold header, the base template and this repo's component list. */
export function createCodecovConfig(components: CoverageConfigComponent[], options: CodecovConfigOptions): string {
	const base = applyStatusRules(CODECOV_TEMPLATE, options.flags, options.documentation);
	return `${scaffoldHeader()}${base}${codecovComponentBlock(components)}`;
}
