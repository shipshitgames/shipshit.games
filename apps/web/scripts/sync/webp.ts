/**
 * Minimal WebP dimension reader (no native deps — sharp is intentionally
 * avoided outside packages/assetgen). Supports VP8 (lossy), VP8L (lossless),
 * and VP8X (extended) containers.
 */
export function readWebpDimensions(bytes: Uint8Array): [number, number] | null {
  if (bytes.length < 30) return null;
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (ascii(0, 4) !== "RIFF" || ascii(8, 4) !== "WEBP") return null;

  const chunk = ascii(12, 4);
  if (chunk === "VP8X") {
    // 24-bit little-endian canvas size minus one, at bytes 24..29.
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    return [width, height];
  }
  if (chunk === "VP8L") {
    // Signature byte 0x2f then 14-bit width-1 / height-1 bitfields.
    if (bytes[20] !== 0x2f) return null;
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return [width, height];
  }
  if (chunk === "VP8 ") {
    // Lossy frame header: sync code 9d 01 2a, then 14-bit dimensions.
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
    const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
    return [width, height];
  }
  return null;
}
