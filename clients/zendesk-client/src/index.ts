import { createZendeskRestClient, type ZendeskClientOptions } from "./utils.js";
import { activities } from "./activities/activities.js";
import { search } from "./search/search.js";
import { status } from "./status/status.js";
import { comments } from "./tickets/comments.js";
import { fields } from "./tickets/fields.js";
import { tickets } from "./tickets/tickets.js";

export { createToken, type ZendeskClientOptions } from "./utils.js";

// ── Types ────────────────────────────────────────────────────────────────────
export type * from "./activities/index.js";
export type * from "./attachments/index.js";
export type * from "./group/index.js";
export type * from "./search/index.js";
export type * from "./status/index.js";
export type * from "./tickets/index.js";
export type * from "./types.js";
export type * from "./user/index.js";

// ── Mocks ────────────────────────────────────────────────────────────────────
export { mockActivity, mockActivityResponse } from "./activities/index.js";
export {
	mockImage,
	mockThumbnail,
	mockAttachment,
} from "./attachments/index.js";
export { mockGroup } from "./group/index.js";
export {
	mockSearchResponseGroups,
	mockSearchResponseTickets,
	mockSearchResponseUsers,
} from "./search/index.js";
export {
	mockDefaultStatus,
	mockCustomStatus,
	mockCustomStatusesResponse,
	mockCustomStatusResponse,
} from "./status/index.js";
export {
	mockComment,
	mockCommentResponse,
	mockCustomField1,
	mockCustomField2,
	mockCustomFields,
	mockTicketMetric,
	mockTicketField,
	mockTicketFieldsResponse,
	mockTicketFieldResponse,
	mockVia,
	mockMetadata,
	mockTicket,
	mockTicketsResponse,
	mockTicketResponse,
} from "./tickets/index.js";
export { mockUser } from "./user/index.js";

// ── Factory ───────────────────────────────────────────────────────────────────
export function createZendeskClient(opts: ZendeskClientOptions) {
	const rest = createZendeskRestClient(opts);
	return {
		activities: activities(rest),
		comments: comments(rest),
		fields: fields(rest),
		search: search(rest),
		status: status(rest),
		tickets: tickets(rest),
	};
}
