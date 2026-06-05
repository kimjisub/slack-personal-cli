import test from "node:test";
import assert from "node:assert/strict";

import { decodeVarint, snappyDecompress } from "../src/leveldb.js";

// Encode a value as a base-128 varint (test helper; mirrors decodeVarint).
function encodeVarint(value) {
  const bytes = [];
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value);
  return bytes;
}

// ── decodeVarint ─────────────────────────────────────────

test("decodeVarint round-trips single- and multi-byte values", () => {
  for (const v of [0, 1, 127, 128, 300, 16384, 1_000_000]) {
    const buf = Buffer.from(encodeVarint(v));
    const [decoded, offset] = decodeVarint(buf, 0);
    assert.equal(decoded, v, `value ${v}`);
    assert.equal(offset, buf.length, `offset for ${v}`);
  }
});

test("decodeVarint resumes from a non-zero offset and reports the next position", () => {
  const buf = Buffer.from([0xff, ...encodeVarint(300)]); // junk byte, then 300
  const [value, offset] = decodeVarint(buf, 1);
  assert.equal(value, 300);
  assert.equal(offset, buf.length);
});

// ── snappyDecompress ─────────────────────────────────────

// A Snappy literal element: tag (len-1)<<2 | 0, then the raw bytes (len < 60).
function literal(bytes) {
  return [((bytes.length - 1) << 2) | 0, ...bytes];
}

test("snappyDecompress decodes a pure-literal block", () => {
  const text = Buffer.from("hello", "utf8");
  const compressed = Buffer.from([
    ...encodeVarint(text.length), // uncompressed length prefix
    ...literal([...text]),
  ]);
  assert.equal(snappyDecompress(compressed).toString("utf8"), "hello");
});

test("snappyDecompress resolves a 2-byte-offset back reference (copy)", () => {
  // "abcabc": literal "abc", then copy offset=3 len=3 (type 2).
  const abc = [0x61, 0x62, 0x63];
  const copyTag = ((3 - 1) << 2) | 2; // len=3, type=2
  const compressed = Buffer.from([
    ...encodeVarint(6),
    ...literal(abc),
    copyTag, 0x03, 0x00, // offset 3, little-endian
  ]);
  assert.equal(snappyDecompress(compressed).toString("utf8"), "abcabc");
});

test("snappyDecompress rejects an absurd declared length", () => {
  // Declare ~2.1 billion uncompressed bytes via a 5-byte varint.
  const huge = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x07]);
  assert.throws(() => snappyDecompress(huge), /bad length/);
});

test("snappyDecompress throws on a literal that overruns the buffer", () => {
  // Declares a 10-byte literal but provides only 2 bytes.
  const compressed = Buffer.from([
    ...encodeVarint(10),
    ((10 - 1) << 2) | 0, // literal tag claiming 10 bytes
    0x61, 0x62,
  ]);
  assert.throws(() => snappyDecompress(compressed), /overflow/);
});
