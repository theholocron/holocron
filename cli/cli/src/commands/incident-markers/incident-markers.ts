/** The key of an incident's post in the forum: the status page's name and the incident's id. */
export function incidentKey(statusPage: string, incidentId: string): string {
	return `${statusPage}#${incidentId}`;
}

/** The footer line that ends an incident's first message, so the incident can be recognised in its post. */
export function incidentMarker(incidentId: string): string {
	return `-# incident: ${incidentId}`;
}

/** The footer line that ends the message an update produced, so a rerun does not post it again. */
export function updateMarker(updateId: string): string {
	return `-# update: ${updateId}`;
}

/** The ids of the updates already posted, read from a post's messages (any order). */
export function postedUpdateIds(messages: readonly string[]): Set<string> {
	const ids = new Set<string>();
	for (const message of messages) {
		for (const line of message.split("\n")) {
			const match = /^-# update: (\S+)\s*$/.exec(line);
			if (match?.[1]) ids.add(match[1]);
		}
	}
	return ids;
}
