/** The value of query parameter `param` in `url`, `null` when the URL has a query but not that parameter, and `""` when it has no query at all.
 *
 * @example
 * ```ts
 * import { getParam } from "@theholocron/uri-utils";
 *
 * getParam("https://example.com?page=2&limit=10", "page"); // "2"
 * getParam("https://example.com?page=2&limit=10", "sort"); // null
 * getParam("https://example.com", "page"); // ""
 * ```
 */
export function getParam(url: string, param: string): string | null {
	const { search } = new URL(url);
	if (search) {
		const params = new URLSearchParams(search);
		return params.get(param);
	}

	return "";
}
