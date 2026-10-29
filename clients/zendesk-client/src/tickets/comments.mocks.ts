import { mockAttachment } from "../attachments/attachments.mocks.js";
import type { IComment, ICommentResponse } from "./comments.types.js";
import { mockMetadata } from "./tickets.mocks.js";

export const mockComment: IComment = {
	attachments: [mockAttachment],
	audit_id: 432567,
	author_id: 123123,
	body: "Thanks for your help!",
	created_at: "2009-07-20T22:55:29Z",
	id: 1274,
	metadata: mockMetadata,
	public: true,
	type: "Comment",
};

export const mockCommentResponse: ICommentResponse = {
	comments: [mockComment],
};
