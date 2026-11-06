/** Most files fetched from a config directory: the area files plus whatever they share, a handful in practice. */
export const MAX_CONFIG_DIR_FILES = 50;

/** Per file; the same 100 KB cap `readRepoText()` puts on a text file a config names. */
export const MAX_CONFIG_DIR_FILE_BYTES = 100 * 1024;

/** In all, so no tree of many large-but-allowed files fills the function's memory or tmp space. */
export const MAX_CONFIG_DIR_BYTES = 512 * 1024;
