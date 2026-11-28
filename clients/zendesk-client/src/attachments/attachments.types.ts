/** An image file stored by Zendesk, such as an attachment or one of its thumbnails. */
export interface IImage {
	/** The MIME type of the file. */
	content_type?: string | null;
	/** The URL to download the file from. */
	content_url?: string | null;
	/** Whether the file has been deleted. */
	deleted?: boolean | null;
	/** The name of the file. */
	file_name?: string | null;
	/** The height of the image in pixels. */
	height?: number | null;
	/** The id of the file, assigned by Zendesk. */
	id?: number | null;
	/** Whether the file is shown inline in the comment body. */
	inline?: boolean | null;
	/** Whether the malware-scan block on the file has been overridden. */
	malware_access_override?: boolean | null;
	/** Outcome of Zendesk's malware scan of the file. */
	malware_scan_result?: "malware_found" | "malware_not_found" | "failed_to_scan" | "not_scanned" | null;
	/** The URL where the file is served from, as mapped by Zendesk. */
	mapped_content_url?: string | null;
	/** The size of the file in bytes. */
	size?: number | null;
	/** The API URL of the file record. */
	url?: string | null;
	/** The width of the image in pixels. */
	width?: number | null;
}

/** A file attached to a comment, with its generated thumbnails. */
export interface IAttachment extends IImage {
	/** Thumbnails Zendesk generated for the attachment. */
	thumbnails?: IImage[];
}
