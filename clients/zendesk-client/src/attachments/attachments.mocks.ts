import type { IAttachment, IImage } from "./attachments.types.js";

/** Fixture for an image record, for use in tests. */
export const mockImage: IImage = {
	content_type: "image/gif",
	content_url: "https://example.zendesk.com/system/photos/8730791/1f84950b8d7949b3.gif",
	deleted: false,
	file_name: "1f84950b8d7949b3.gif",
	height: 80,
	id: 8730791,
	inline: false,
	mapped_content_url: "https://example.zendesk.com/system/photos/8730791/1f84950b8d7949b3.gif",
	size: 4566,
	url: "https://example.zendesk.com/api/v2/attachments/8730791.json",
	width: 80,
};

/** Fixture for an attachment thumbnail image, for use in tests. */
export const mockThumbnail: IImage = {
	content_type: "image/gif",
	content_url: "https://example.zendesk.com/system/photos/8730801/1f84950b8d7949b3_thumb.gif",
	deleted: false,
	file_name: "1f84950b8d7949b3_thumb.gif",
	height: 32,
	id: 8730801,
	inline: false,
	mapped_content_url: "https://example.zendesk.com/system/photos/8730801/1f84950b8d7949b3_thumb.gif",
	size: 1517,
	url: "https://example.zendesk.com/api/v2/attachments/8730801.json",
	width: 32,
};

/** Fixture for an attachment that carries a thumbnail, for use in tests. */
export const mockAttachment: IAttachment = {
	...mockImage,
	thumbnails: [mockThumbnail],
};
