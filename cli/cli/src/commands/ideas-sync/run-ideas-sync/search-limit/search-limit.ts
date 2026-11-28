/**
 * How many text matches a marker search reads back, before the first search of a note and after the create alike; the
 * exact marker is then checked in each body. The marker holds the note's path, so true hits are few and the bound is
 * only a cap on loose text matches. The search itself is bounded by the provider: GitHub pages up to 2000 recent issues
 * (20 pages of 100) and filters them client-side, so an issue older than that is still missed, and each search spends
 * rate limit. Linear filters on the server. There is no paging beyond this.
 */
export const SEARCH_LIMIT = 100;
