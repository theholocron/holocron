/**
 * Turns a leading `~` into the home folder, because the command is started without a shell that would do it.
 * `~` alone and `~/...` are expanded; `~user/...`, absolute paths and anything else come back as they were.
 */
export function expandHome(value: string, home: string): string {
	if (value !== "~" && !value.startsWith("~/")) return value;
	const base = home.replace(/\/+$/, "");
	return value === "~" ? (base === "" ? "/" : base) : `${base}${value.slice(1)}`;
}
