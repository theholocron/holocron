export interface IImage {
	content_type?: string | null;
	content_url?: string | null;
	deleted?: boolean | null;
	file_name?: string | null;
	height?: number | null;
	id?: number | null;
	inline?: boolean | null;
	malware_access_override?: boolean | null;
	malware_scan_result?:
		| "malware_found"
		| "malware_not_found"
		| "failed_to_scan"
		| "not_scanned"
		| null;
	mapped_content_url?: string | null;
	size?: number | null;
	url?: string | null;
	width?: number | null;
}

export interface IAttachment extends IImage {
	thumbnails?: IImage[];
}
