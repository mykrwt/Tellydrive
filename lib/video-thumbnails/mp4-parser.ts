/**
 * Pure-Javascript MP4 dimension parser.
 * Parses ftyp/moov/trak/stsd/avc1 boxes to extract width/height
 * without any external dependencies. Falls back gracefully for
 * formats it cannot parse.
 */

const BOX_HEADER_SIZE = 8;
const MAX_SCAN_BYTES = 64 * 1024 * 1024; // scan at most 64 MB for moov

type Dimensions = { width: number; height: number } | null;

function readU32(buf: Buffer, off: number): number {
  return buf.readUInt32BE(off);
}

function readU16(buf: Buffer, off: number): number {
  return buf.readUInt16BE(off);
}

function readBoxHeader(buf: Buffer, off: number): { size: number; type: string; nextOff: number } | null {
  if (off + 8 > buf.length) return null;
  const size = readU32(buf, off);
  const type = buf.toString("ascii", off + 4, off + 8);
  if (!type || type.includes("\x00")) return null;
  let nextOff: number;
  if (size === 1) {
    // Extended size box — skip (unlikely in well-formed small files)
    if (off + 16 > buf.length) return null;
    nextOff = off + 16 + readU32(buf, off + 8) - 8;
  } else if (size === 0) {
    // Box extends to EOF
    nextOff = buf.length;
  } else {
    nextOff = off + size;
  }
  return { size, type, nextOff };
}

/**
 * Find the `moov` box offset by scanning from the start or the end.
 * moov is usually at the start for progressive files, at the end for
 * files written by many encoders. We try start first, then tail.
 */
function findMoovOffset(buf: Buffer): number {
  // Try scanning from start (fast path — moov usually first)
  let off = 0;
  while (off + 8 <= buf.length && off < Math.min(buf.length, 256 * 1024)) {
    const hdr = readBoxHeader(buf, off);
    if (!hdr) break;
    if (hdr.type === "moov") return off;
    off = hdr.nextOff;
  }
  // If not found, scan from end (moov at EOF — typical for Phone recordings)
  off = buf.length;
  const scanFromEnd = Math.min(buf.length, 2 * 1024 * 1024);
  while (off > scanFromEnd) {
    if (off - 8 < 0) break;
    // Try reading box header ending at `off`
    // We need to scan backwards; instead peek at last 8 bytes
    off -= 1;
    if (off + 8 > buf.length) break;
    const potentialType = buf.toString("ascii", off + 4, off + 8);
    if (potentialType === "moov") {
      const size = readU32(buf, off);
      if (size === 0 || size === 1 || off + size <= buf.length) {
        return off;
      }
    }
  }
  return -1;
}

/**
 * Walk boxes recursively looking for an avc1/avc3 or vp09 video sample
 * description box, then extract width/height from the VisualSampleEntry.
 */
function extractDimensionsFromBox(
  buf: Buffer,
  boxOff: number,
  boxEnd: number,
  targetTypes: string[]
): Dimensions {
  let off = boxOff + BOX_HEADER_SIZE;
  while (off < boxEnd && off + 8 <= boxEnd) {
    const hdr = readBoxHeader(buf, off);
    if (!hdr || hdr.nextOff <= off) break;
    const isTarget = targetTypes.includes(hdr.type);
    // Recurse into containers
    if (hdr.type === "moov" || hdr.type === "trak" || hdr.type === "mdia" ||
        hdr.type === "minf" || hdr.type === "stbl" || hdr.type === "stsd" ||
        hdr.type === "stts" || hdr.type === "stsc" || hdr.type === "stsz" ||
        hdr.type === "stco" || hdr.type === "co64" || hdr.type === "dinf" ||
        hdr.type === "edts" || hdr.type === "udta" || hdr.type.startsWith("meta")) {
      const dim = extractDimensionsFromBox(buf, off, hdr.nextOff, targetTypes);
      if (dim) return dim;
    } else if (isTarget) {
      // avc1, avc3, vp09, avc4 — try to read VisualSampleEntry dimensions
      const dim = readVideoSampleEntryDimensions(buf, off);
      if (dim) return dim;
    }
    off = hdr.nextOff;
  }
  return null;
}

/**
 * Read width/height from an avc1/avc3/avc4 VisualSampleEntry.
 * Offset layout inside the sample entry (after the 8-byte box header):
 *   +0: reserved (6 bytes) + data_ref_index (2 bytes) = 8 bytes
 *   +8: pre_defined (2 bytes) + reserved (10 bytes) = 12 bytes
 *  +20: width (2 bytes, UInt16)
 *  +22: height (2 bytes, UInt16)
 *  +24: horizresolution (4 bytes)
 *  +28: vertresolution (4 bytes)
 *  +32: reserved (4 bytes)
 *  +36: frame_count (2 bytes)
 *  +38: compr_algo (2 bytes) — 0 = raw
 *  +40: depth (2 bytes)
 *  +42: pre_defined (2 bytes)
 * Then colour information may follow (for avc1, a 6-byte colour description;
 *  for some encoders an XP specified here too).
 *
 * Total overhead before colour/transfer matrices = 44 bytes after sample entry start.
 * We read width/height at +20/+22 relative to the start of the entry content
 * (i.e. 8 bytes after the box header for the type+version+flags of the avc1 box itself,
 *  but actually avc1 box header is the 8 bytes we already skipped — so +20 from here).
 */
function readVideoSampleEntryDimensions(buf: Buffer, boxOff: number): Dimensions {
  // boxOff points to start of the avc1/avc3 box (type+size header)
  const contentOff = boxOff + BOX_HEADER_HEADER_SIZE;
  // For avc1/avc3, version=0, flags=0 typically (4 bytes)
  // So sample entry starts at contentOff + 4
  const seOff = contentOff + 4;
  if (seOff + 44 > buf.length) return null;
  const width = readU16(buf, seOff + 20);
  const height = readU16(buf, seOff + 22);
  if (width === 0 || height === 0) return null;
  // Sanity: reject obviously wrong values
  if (width > 16384 || height > 16384) return null;
  return { width, height };
}

// eslint-disable-next-line @typescript-eslint/no-magic-numbers
const BOX_HEADER_HEADER_SIZE = 8;

/**
 * Try to extract video dimensions from an MP4/MOV buffer.
 * Returns null if dimensions cannot be determined.
 */
export function getMp4Dimensions(buf: Buffer): Dimensions {
  const moovOff = findMoovOffset(buf);
  if (moovOff < 0) return null;
  // Read moov box size to find its end
  const moovSize = readU32(buf, moovOff);
  const moovEnd = moovSize === 0 ? buf.length : moovOff + moovSize;
  return extractDimensionsFromBox(buf, moovOff, Math.min(moovEnd, buf.length), [
    "avc1", "avc3", "avc4", "vp09",
  ]);
}

/**
 * Check whether a buffer looks like an MP4/MOV file.
 */
export function isMp4(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  // ftyp box at offset 0
  const type = buf.toString("ascii", 4, 8);
  return type === "ftyp";
}

/**
 * Check if a filename suggests a video type we can parse.
 */
export function isVideoFileName(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ["mp4", "mov", "m4v", "webm", "mkv", "avi", "3gp", "mpg", "mpeg", "ts"].includes(ext);
}
