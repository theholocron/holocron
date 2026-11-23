/** An incident's post as it should read now: the title, the first message and the tag. */
export interface RenderedIncident {
	/** The post's title. */
	title: string;
	/** The first message, ending with the incident's marker line. */
	body: string;
	/** The tag: the newest update's status, or `maintenance` while an incident that only marks maintenance is open. */
	tag: string;
}
