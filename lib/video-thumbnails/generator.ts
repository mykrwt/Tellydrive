/**
 * Video thumbnail generator - pure JS PNG encoder
 * No external dependencies (uses Node built-in zlib).
 */

import { getMp4Dimensions, isMp4 } from "./mp4-parser";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const zlib = require("zlib");
const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// PNG helpers
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ 0xffffffff) >>> 0;
}
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; }
  return t;
})();

function pngChunk(type: string, data: Buffer): Buffer {
  const tb = Buffer.from(type, "ascii");
  const cd = Buffer.concat([tb, data]);
  const lb = Buffer.alloc(4); lb.writeUInt32BE(data.length, 0);
  const cb = Buffer.alloc(4); cb.writeUInt32BE(crc32(cd), 0);
  return Buffer.concat([lb, tb, data, cb]);
}

function pngIHDR(w: number, h: number): Buffer {
  const d = Buffer.alloc(13);
  d.writeUInt32BE(w, 0); d.writeUInt32BE(h, 4);
  d[8] = 8; d[9] = 2; d[10] = 0; d[11] = 0; d[12] = 0;
  return pngChunk("IHDR", d);
}

function pngIDAT(rows: Buffer[]): Buffer {
  return pngChunk("IDAT", zlib.deflateSync(Buffer.concat(rows), { level: 9 }));
}

function pngIEND(): Buffer { return pngChunk("IEND", Buffer.alloc(0)); }

function makeRow(p: Uint8ClampedArray, w: number): Buffer {
  const row = Buffer.alloc(w * 3 + 1);
  row[0] = 0;
  for (let x = 0; x < w; x++) {
    row[1 + x * 3] = p[x * 4];
    row[1 + x * 3 + 1] = p[x * 4 + 1];
    row[1 + x * 3 + 2] = p[x * 4 + 2];
  }
  return row;
}

function lerp(a: number, b: number, t: number): number { return Math.round(a + (b - a) * t); }

// Generate play icon pattern
function createPlayIcon(size: number): number[][] {
  const pattern: number[][] = [];
  const cx = size / 2, cy = size / 2;
  const v1x = cx - size * 0.15, v1y = cy - size * 0.35;
  const v2x = cx - size * 0.15, v2y = cy + size * 0.35;
  const v3x = cx + size * 0.35, v3y = cy;
  for (let row = 0; row < size; row++) {
    pattern[row] = [];
    for (let col = 0; col < size; col++) {
      const px = col, py = row;
      const d1 = (px - v2x) * (v1y - v2y) - (v1x - v2x) * (py - v2y);
      const d2 = (px - v3x) * (v2y - v3y) - (v2x - v3x) * (py - v3y);
      const d3 = (px - v1x) * (v3y - v1y) - (v3x - v1x) * (py - v1y);
      const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
      const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
      pattern[row][col] = (!(hasNeg && hasPos)) ? 1 : 0;
    }
  }
  return pattern;
}

// Constants
const GRADIENT_TOP: [number, number, number] = [30, 60, 110];
const GRADIENT_BOTTOM: [number, number, number] = [10, 20, 50];
const TEXT_COLOR: [number, number, number] = [220, 230, 255];
const SUB_COLOR: [number, number, number] = [160, 175, 210];

function formatDuration(sec: number): string {
  if (sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ":" + String(s).padStart(2, "0");
}

function formatSizeMB(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

/**
 * Generate a video thumbnail PNG buffer.
 */
export function generateVideoThumbnail(
  width: number,
  height: number,
  durationSec: number,
  sizeBytes: number
): Buffer {
  const canvasSize = 320;
  const canvasW = canvasSize;
  const canvasH = canvasSize;
  const pixels = new Uint8ClampedArray(canvasW * canvasH * 4);
  
  // Background gradient with vignette
  for (let y = 0; y < canvasH; y++) {
    const t = canvasH > 1 ? y / (canvasH - 1) : 0.5;
    const r = lerp(GRADIENT_TOP[0], GRADIENT_BOTTOM[0], t);
    const g = lerp(GRADIENT_TOP[1], GRADIENT_BOTTOM[1], t);
    const b = lerp(GRADIENT_TOP[2], GRADIENT_BOTTOM[2], t);
    const vignette = 1 - 0.3 * Math.pow(Math.abs(y / canvasH - 0.5) * 2, 2);
    
    for (let x = 0; x < canvasW; x++) {
      const pi = (y * canvasW + x) * 4;
      pixels[pi] = Math.round(r * vignette);
      pixels[pi + 1] = Math.round(g * vignette);
      pixels[pi + 2] = Math.round(b * vignette);
      pixels[pi + 3] = 255;
    }
  }
  
  // Draw play icon in center
  const playSize = 60;
  const playPattern = createPlayIcon(playSize);
  const cx = Math.round(canvasW / 2);
  const cy = Math.round(canvasH / 2);
  const playColor: [number, number, number] = [255, 255, 255];
  
  for (let row = 0; row < playSize; row++) {
    for (let col = 0; col < playSize; col++) {
      if (playPattern[row][col]) {
        const px = cx - Math.floor(playSize / 2) + col;
        const py = cy - Math.floor(playSize / 2) + row;
        if (px >= 0 && px < canvasW && py >= 0 && py < canvasH) {
          const pi = (py * canvasW + px) * 4;
          pixels[pi] = playColor[0];
          pixels[pi + 1] = playColor[1];
          pixels[pi + 2] = playColor[2];
        }
      }
    }
  }
  
  // Draw text overlays (simple rectangles as text placeholders)
  const durationStr = formatDuration(durationSec);
  const sizeStr = formatSizeMB(sizeBytes);
  
  // Duration text (top right area)
  const durX = canvasW - 100;
  const durY = 20;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 40; col++) {
      const pi = ((durY + row) * canvasW + (durX + col)) * 4;
      pixels[pi] = TEXT_COLOR[0];
      pixels[pi + 1] = TEXT_COLOR[1];
      pixels[pi + 2] = TEXT_COLOR[2];
    }
  }
  
  // Size text
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 35; col++) {
      const pi = ((40 + row) * canvasW + (durX + col)) * 4;
      pixels[pi] = SUB_COLOR[0];
      pixels[pi + 1] = SUB_COLOR[1];
      pixels[pi + 2] = SUB_COLOR[2];
    }
  }
  
  // VIDEO badge (bottom left)
  const badgeX = 16;
  const badgeY = canvasH - 28;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 32; col++) {
      const pi = ((badgeY + row) * canvasW + (badgeX + col)) * 4;
      pixels[pi] = TEXT_COLOR[0];
      pixels[pi + 1] = TEXT_COLOR[1];
      pixels[pi + 2] = TEXT_COLOR[2];
    }
  }
  
  // Build PNG
  const rows: Buffer[] = [];
  for (let y = 0; y < canvasH; y++) {
    rows.push(makeRow(pixels, canvasW));
  }
  
  return Buffer.concat([
    PNG_SIG,
    pngIHDR(canvasW, canvasH),
    pngIDAT(rows),
    pngIEND(),
  ]);
}

// Storage helpers
export async function saveVideoThumbnail(
  sourceVideoPath: string,
  sourceSize: number,
  durationSec: number,
  sourceWidth: number,
  sourceHeight: number
): Promise<string | null> {
  try {
    const { randomUUID } = await import("node:crypto");
    const id = randomUUID();
    const destDir = path.join(process.cwd(), ".data", "files");
    await mkdir(destDir, { recursive: true });
    const destPath = path.join(destDir, `thumb-${id}.png`);
    
    let w = sourceWidth;
    let h = sourceHeight;
    
    if (w === 0 || h === 0) {
      try {
        const raw = await readFile(sourceVideoPath);
        if (isMp4(raw)) {
          const dim = getMp4Dimensions(raw);
          if (dim) { w = dim.width; h = dim.height; }
        }
      } catch { /* best-effort */ }
    }
    
    const thumbBuf = generateVideoThumbnail(w, h, durationSec, sourceSize);
    await writeFile(destPath, thumbBuf, { mode: 0o600 });
    return `local:${id}`;
  } catch {
    return null;
  }
}

export function getThumbnailUrl(thumbnailFileId: string): string {
  if (thumbnailFileId.startsWith("local:")) {
    const id = thumbnailFileId.slice(6);
    return `/api/local-file?id=${encodeURIComponent(id)}`;
  }
  return `/api/files/${thumbnailFileId}?thumbnail=1`;
}
