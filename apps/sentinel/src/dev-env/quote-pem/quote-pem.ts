/**
 * Wrap an unquoted PEM block in double quotes. `op environment secret list --format=dotenv` prints a multi-line
 * value (a private key) unquoted, which `dotenv` reads as its first line only; quoted, it reads the whole block.
 * A PEM holds no quote or backslash, so nothing needs escaping.
 */
export function quotePem(text: string): string {
	return text.replace(
		/^([A-Za-z_][A-Za-z0-9_]*)=(-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----)[ \t]*$/gm,
		'$1="$2"'
	);
}
