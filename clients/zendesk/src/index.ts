import activities, { mockActivity, mockActivityResponse } from "./activities/index.js";
import type { IActivity, IActivityResponse } from "./activities/index.js";
import { mockImage, mockThumbnail, mockAttachment } from "./attachments/index.js";
import type { IImage, IAttachment } from "./attachments/index.js";
import { mockGroup } from "./group/index.js";
import type { IGroup } from "./group/index.js";
import search, { mockSearchResponseGroups, mockSearchResponseTickets, mockSearchResponseUsers } from "./search/index.js";
import type { ISearchResponse } from "./search/index.js";
import status, { mockDefaultStatus, mockCustomStatus, mockCustomStatusesResponse, mockCustomStatusResponse } from "./status/index.js";
import type { IDefaultStatus, ICustomStatus, ICustomStatusResponse, ICustomStatusesResponse } from "./status/index.js";
import tickets, {
	mockComment,
	mockCommentResponse,
	mockCustomField1,
	mockCustomField2,
	mockCustomFields,
	mockTicketField,
	mockTicketFieldsResponse,
	mockTicketFieldResponse,
	mockTicketMetric,
	mockVia,
	mockMetadata,
	mockTicket,
	mockTicketsResponse,
	mockTicketResponse,
} from "./tickets/index.js";
import type {
	IComment,
	ICommentResponse,
	ICustomField,
	IMetadata,
	ITicketField,
	TTicketFieldResponse,
	TTicketFieldsResponse,
	TTicketStatus,
	TTicketPriority,
	TTicketType,
	ITicket,
	ITicketMetric,
	TTicketResponse,
	TTicketsResponse,
	IVia,
} from "./tickets/index.js";
import type { IAPIError, IAPIResponse } from "./types.js";
import { mockUser } from "./user/index.js";
import type { IUser } from "./user/index.js";

export type {
	IActivity,
	IActivityResponse,
	IAPIError,
	IAPIResponse,
	IImage,
	IAttachment,
	IComment,
	ICommentResponse,
	ICustomField,
	ICustomStatus,
	ISearchResponse,
	IDefaultStatus,
	ICustomStatusResponse,
	ICustomStatusesResponse,
	IGroup,
	IMetadata,
	ITicket,
	ITicketField,
	TTicketFieldResponse,
	TTicketFieldsResponse,
	ITicketMetric,
	TTicketPriority,
	TTicketResponse,
	TTicketsResponse,
	TTicketStatus,
	TTicketType,
	IUser,
	IVia,
}

export {
	mockActivity,
	mockActivityResponse,
	mockImage,
	mockThumbnail,
	mockAttachment,
	mockGroup,
	mockSearchResponseGroups,
	mockSearchResponseTickets,
	mockSearchResponseUsers,
	mockDefaultStatus,
	mockCustomStatus,
	mockCustomStatusesResponse,
	mockCustomStatusResponse,
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
	mockUser,
};

export { createToken, setToken } from "./utils.js";
export default {
	activities,
	search,
	status,
	tickets,
};
