import type { IAttachment } from "../attachments/attachments.types.js";
import type { IMetadata, IVia } from "./tickets.types.js";

export interface IComment {
	// Attachments, if any. See Attachment
	attachments?: IAttachment[] | null;
	// The id of the ticket audit record. See Show Audit
	audit_id?: number | null;
	// The id of the comment author. See Author id
	author_id?: number | null;
	// The comment string. See Bodies
	body?: string | null;
	// The time the comment was created
	created_at?: string | null;
	// The comment formatted as HTML. See Bodies
	html_body?: string | null;
	// Automatically assigned when the comment is created
	id?: number | null;
	// System information (web client, IP address, etc.) and comment flags, if any. See Comment flags
	metadata?: IMetadata | null;
	// The comment presented as plain text. See Bodies
	plain_body?: string | null;
	// true if a public comment; false if an internal note. The initial value set on ticket creation persists for any additional comment unless you change it
	public?: boolean | null;
	// Comment or VoiceComment. The JSON object for adding voice comments to tickets is different. See Adding voice comments to tickets
	type?: "Comment" | "VoiceComment" | null;
	// List of tokens received from uploading files for comment attachments. The files are attached by creating or updating tickets with the tokens. See Attaching files in Tickets
	uploads?: string[] | null;
	// Describes how the object was created. See the Via object reference
	via?: IVia | null;
}

export interface ICommentResponse {
	comments: IComment[];
}
