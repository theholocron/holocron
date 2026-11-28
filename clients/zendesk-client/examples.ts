// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import zendesk, { createToken } from "./src";

const token = createToken("REDACTED_EMAIL", "REDACTED_TOKEN");

/*
zendesk.activities.get({ token, params: { since: "2023-06-01T00:00:00.000Z" } })
	.then((data) => console.log({ data }));
*/

/*
zendesk.status.get({ params: { active: true }, token })
	.then((data) => console.log({ data }));
*/

/*
zendesk.search(`loanNumber=6120150431`, { params: { "include": "tickets(metric_sets)" }, token })
	.then((data) => console.log({ data: data[1].results }));
*/

zendesk.tickets.comments
	.get(2700, { params: { include: "users" }, token })
	.then((data) => console.log({ data: data[1].users }));

/*
zendesk.tickets.get(2709, { token })
	.then((data) => {
		// const needle = (data[1] as TTicketResponse).ticket.custom_fields.find(({ id }: { id: number }) => id === 17502697524116);
		console.log({ data })
	});
*/

/*
zendesk.tickets.fields.get({ token })
	.then((data) => {
		// const needle = (data[1] as TTicketFieldsResponse).ticket_fields.find(({ title }: { title: string }) => title.includes("BHD"));
		console.log({ data })
	});
*/

/*
zendesk.tickets.update(2700, {
	comment: {
		body: "this is a test from the API",
	}
}, { token })
	.then((data) => console.log({ data }));
*/
