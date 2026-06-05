/**
 * Pure binary helpers for reading Chromium LevelDB SSTable blocks, which is how
 * the Slack desktop app stores `localConfig_v2` (and the session tokens inside
 * it). These are isolated here, free of any I/O or Slack specifics, so the
 * fragile parsing layer can be unit-tested directly.
 */

/**
 * Decode a base-128 varint.
 * @param {Buffer|Uint8Array} buf
 * @param {number} offset
 * @returns {[number, number]} the decoded value and the offset past it
 */
export function decodeVarint(buf, offset) {
  let result = 0;
  let shift = 0;
  while (offset < buf.length) {
    const b = buf[offset++];
    result |= (b & 0x7f) << shift;
    if (!(b & 0x80)) return [result, offset];
    shift += 7;
  }
  return [result, offset];
}

/**
 * Decompress a Snappy block (the framing LevelDB uses for compressed SSTable
 * blocks). Supports literals and both copy encodings; throws on malformed input
 * rather than reading out of bounds.
 * @param {Buffer} compressed
 * @returns {Buffer} the decompressed bytes
 */
export function snappyDecompress(compressed) {
  const [uncompressedLen, dataStart] = decodeVarint(compressed, 0);
  if (uncompressedLen > 10_000_000 || uncompressedLen < 0) throw new Error("bad length");
  let pos = dataStart;
  const out = Buffer.alloc(uncompressedLen);
  let outPos = 0;
  while (pos < compressed.length && outPos < uncompressedLen) {
    const tag = compressed[pos++];
    const type = tag & 3;
    if (type === 0) {
      let len = (tag >> 2) + 1;
      if (len === 61) { len = compressed[pos++] + 1; }
      else if (len === 62) { len = compressed[pos] | (compressed[pos + 1] << 8); pos += 2; len += 1; }
      else if (len === 63) { len = compressed[pos] | (compressed[pos + 1] << 8) | (compressed[pos + 2] << 16); pos += 3; len += 1; }
      else if (len === 64) { len = compressed[pos] | (compressed[pos + 1] << 8) | (compressed[pos + 2] << 16) | (compressed[pos + 3] << 24); pos += 4; len += 1; }
      if (pos + len > compressed.length) throw new Error("overflow");
      compressed.copy(out, outPos, pos, pos + len);
      pos += len; outPos += len;
    } else if (type === 1) {
      const len = ((tag >> 2) & 7) + 4;
      const off = ((tag >> 5) << 8) | compressed[pos++];
      for (let i = 0; i < len; i++) out[outPos + i] = out[outPos - off + i];
      outPos += len;
    } else if (type === 2) {
      const len = (tag >> 2) + 1;
      const off = compressed[pos] | (compressed[pos + 1] << 8); pos += 2;
      for (let i = 0; i < len; i++) out[outPos + i] = out[outPos - off + i];
      outPos += len;
    } else {
      throw new Error("snappy type 3");
    }
  }
  return out.subarray(0, outPos);
}
