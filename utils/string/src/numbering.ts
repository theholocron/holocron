export function toPlural(
	count: number,
	singular: string,
	plural?: string
): string {
	if (count === 1) return `${count} ${singular}`;

	// Determine plural form if not provided
	if (!plural) {
		if (/[sxz]$/.test(singular) || /[sh]$/.test(singular.slice(-2))) {
			// Words ending in s, x, z, sh, or ch get "es"
			return `${count} ${singular}es`;
		}

		if (/[^aeiou]y$/.test(singular)) {
			// Words ending in consonant + y change "y" to "ies"
			return `${count} ${singular.slice(0, -1)}ies`;
		}

		// Default: add "s"
		return `${count} ${singular}s`;
	}

	return `${count} ${plural}`;
}
