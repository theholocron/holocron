export function getParam (url: string, param: string): string | null {
	const { search } = new URL(url);
	if (search) {
		const params = new URLSearchParams(search);
		return params.get(param);
	}

	return "";
}
