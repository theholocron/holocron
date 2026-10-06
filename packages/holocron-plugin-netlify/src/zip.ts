/**
 * Minimal ZIP archive builder — STORED (uncompressed) entries only, no
 * external dependency. Netlify's zip-upload deploy endpoint
 * (`uploadZipDeploy` in `rest.ts`) just needs a well-formed archive; it
 * doesn't care whether entries are compressed. A real dependency
 * (`archiver`, `jszip`) would pull in a whole deflate implementation for
 * a format Node's own `node:zlib` already has half of (`crc32`) — the
 * remaining half (ZIP's container format: local file headers, central
 * directory, end-of-central-directory record) is ~80 lines of fixed-width
 * binary writing, not worth a dependency for.
 *
 * Fixed mod-time (1980-01-01 00:00, the DOS epoch) on every entry —
 * deploy content is byte-identical regardless of wall-clock time, so a
 * real timestamp would only make otherwise-identical deploys look
 * different in diffs/caches for no benefit.
 */

const DOS_EPOCH_DATE = 0x21; // 1980-01-01 packed as (year-1980)<<9 | month<<5 | day
const DOS_EPOCH_TIME = 0x00;
const VERSION_NEEDED = 20;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIR_SIGNATURE = 0x06054b50;

interface Entry {
	path: string;
	content: Uint8Array;
}

/**
 * Standard CRC-32 (IEEE 802.3 / zip/gzip polynomial), table-based.
 * `node:zlib`'s own `crc32()` only landed in Node 22.2.0 — this plugin
 * declares `engines.node: ">=22.0.0"` like every other plugin in this
 * org, so depending on it would mean a stricter minimum than the rest
 * of the org for one small utility. The algorithm itself is public
 * domain and unchanged since 1975; no real risk in owning these ~20 lines.
 */
const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[n] = c;
	}
	return table;
})();

function crc32(data: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of data) {
		crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

/** Builds a STORED-method ZIP archive from `{ path: utf8-content }` entries. */
export function buildZip(files: Record<string, string>): Uint8Array {
	const entries: Entry[] = Object.entries(files).map(([path, content]) => ({
		path: path.startsWith("/") ? path.slice(1) : path,
		content: new TextEncoder().encode(content),
	}));

	const localParts: Uint8Array[] = [];
	const centralParts: Uint8Array[] = [];
	let offset = 0;

	for (const entry of entries) {
		const nameBytes = new TextEncoder().encode(entry.path);
		const crc = crc32(entry.content) >>> 0;
		const size = entry.content.byteLength;

		const localHeader = new DataView(new ArrayBuffer(30));
		localHeader.setUint32(0, LOCAL_HEADER_SIGNATURE, true);
		localHeader.setUint16(4, VERSION_NEEDED, true);
		localHeader.setUint16(6, 0, true); // general purpose flag
		localHeader.setUint16(8, 0, true); // compression method: STORED
		localHeader.setUint16(10, DOS_EPOCH_TIME, true);
		localHeader.setUint16(12, DOS_EPOCH_DATE, true);
		localHeader.setUint32(14, crc, true);
		localHeader.setUint32(18, size, true); // compressed size
		localHeader.setUint32(22, size, true); // uncompressed size
		localHeader.setUint16(26, nameBytes.byteLength, true);
		localHeader.setUint16(28, 0, true); // extra field length

		localParts.push(new Uint8Array(localHeader.buffer), nameBytes, entry.content);

		const centralHeader = new DataView(new ArrayBuffer(46));
		centralHeader.setUint32(0, CENTRAL_HEADER_SIGNATURE, true);
		centralHeader.setUint16(4, VERSION_NEEDED, true); // version made by
		centralHeader.setUint16(6, VERSION_NEEDED, true); // version needed
		centralHeader.setUint16(8, 0, true); // general purpose flag
		centralHeader.setUint16(10, 0, true); // compression method
		centralHeader.setUint16(12, DOS_EPOCH_TIME, true);
		centralHeader.setUint16(14, DOS_EPOCH_DATE, true);
		centralHeader.setUint32(16, crc, true);
		centralHeader.setUint32(20, size, true); // compressed size
		centralHeader.setUint32(24, size, true); // uncompressed size
		centralHeader.setUint16(28, nameBytes.byteLength, true);
		centralHeader.setUint16(30, 0, true); // extra field length
		centralHeader.setUint16(32, 0, true); // file comment length
		centralHeader.setUint16(34, 0, true); // disk number start
		centralHeader.setUint16(36, 0, true); // internal file attributes
		centralHeader.setUint32(38, 0, true); // external file attributes
		centralHeader.setUint32(42, offset, true); // relative offset of local header

		centralParts.push(new Uint8Array(centralHeader.buffer), nameBytes);

		offset += 30 + nameBytes.byteLength + size;
	}

	const centralDirOffset = offset;
	const centralDirBytes = centralParts.reduce((sum, p) => sum + p.byteLength, 0);

	const endRecord = new DataView(new ArrayBuffer(22));
	endRecord.setUint32(0, END_OF_CENTRAL_DIR_SIGNATURE, true);
	endRecord.setUint16(4, 0, true); // disk number
	endRecord.setUint16(6, 0, true); // disk where central directory starts
	endRecord.setUint16(8, entries.length, true); // records on this disk
	endRecord.setUint16(10, entries.length, true); // total records
	endRecord.setUint32(12, centralDirBytes, true);
	endRecord.setUint32(16, centralDirOffset, true);
	endRecord.setUint16(20, 0, true); // comment length

	const total = new Uint8Array(offset + centralDirBytes + 22);
	let pos = 0;
	for (const part of [...localParts, ...centralParts, new Uint8Array(endRecord.buffer)]) {
		total.set(part, pos);
		pos += part.byteLength;
	}
	return total;
}
