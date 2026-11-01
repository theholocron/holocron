/** The value of query parameter `param` in `url`, `null` when the URL has a query but not that parameter, and `""` when it has no query at all. */
export function getParam(url: string, param: string): string | null {
	const { search } = new URL(url);
	if (search) {
		const params = new URLSearchParams(search);
		return params.get(param);
	}

	return "";
}
