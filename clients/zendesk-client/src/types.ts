export interface IAPIResponse {
	next_page?: string | null;
	previous_page?: string | null;
	count: number;
}

export interface IAPIError {
	error: string;
	description: string;
}
