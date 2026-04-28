/**
 * Slack auth — extracts session credentials from the Slack desktop app on macOS.
 *
 * 1. Keychain → "Slack Safe Storage" password
 * 2. Cookies SQLite → encrypted `d` cookie → AES-128-CBC decrypt
 * 3. LevelDB files → `xoxc-` token (string scan)
 */

import { execSync, spawnSync } from "child_process";
import { readFileSync, readdirSync, copyFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir, tmpdir } from "os";
import { pbkdf2Sync } from "crypto";

import { existsSync, mkdirSync } from "fs";

const SLACK_DIR_DIRECT = join(homedir(), "Library", "Application Support", "Slack");
const SLACK_DIR_APPSTORE = join(
  homedir(),
  "Library", "Containers", "com.tinyspeck.slackmacgap",
  "Data", "Library", "Application Support", "Slack"
);

function resolveSlackDir() {
  if (existsSync(SLACK_DIR_DIRECT)) return SLACK_DIR_DIRECT;
  if (existsSync(SLACK_DIR_APPSTORE)) return SLACK_DIR_APPSTORE;
  console.error(
    "Could not find Slack data directory.\n" +
    "Checked:\n" +
    `  ${SLACK_DIR_DIRECT}\n` +
    `  ${SLACK_DIR_APPSTORE}\n` +
    "Is Slack installed?"
  );
  process.exit(1);
}

const SLACK_DIR = resolveSlackDir();
const LEVELDB_DIR = join(SLACK_DIR, "Local Storage", "leveldb");
const COOKIES_DB = join(SLACK_DIR, "Cookies");
const CACHE_DIR = join(homedir(), ".local", "slk");
const TOKEN_CACHE = join(CACHE_DIR, "token-cache.json");
const ACTIVE_WORKSPACE = join(CACHE_DIR, "active-workspace");

let cachedCreds = null;

function getKeychainKey() {
  // Mac App Store Slack uses account "Slack App Store Key", direct download uses "Slack" or "Slack Key"
  const accounts = SLACK_DIR === SLACK_DIR_APPSTORE
    ? ["Slack App Store Key", "Slack Key", "Slack"]
    : ["Slack Key", "Slack", "Slack App Store Key"];

  for (const account of accounts) {
    try {
      return Buffer.from(
        execSync(
          `security find-generic-password -s "Slack Safe Storage" -a "${account}" -w`,
          { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
        ).trim()
      );
    } catch {}
  }

  console.error("Could not find Slack Safe Storage key in Keychain.");
  process.exit(1);
}

function decryptCookie() {
  const tmpDb = join(tmpdir(), `slk_cookies_${Date.now()}.db`);
  copyFileSync(COOKIES_DB, tmpDb);

  try {
    const hex = execSync(
      `sqlite3 "${tmpDb}" "SELECT hex(encrypted_value) FROM cookies WHERE name='d' AND host_key='.slack.com' LIMIT 1;"`,
      { encoding: "utf-8" }
    ).trim();

    if (!hex) throw new Error("No 'd' cookie found in Slack cookie store");

    const encrypted = Buffer.from(hex, "hex");

    if (encrypted.subarray(0, 3).toString() !== "v10") {
      throw new Error("Unknown cookie encryption format");
    }

    const data = encrypted.subarray(3);
    const aesKey = pbkdf2Sync(getKeychainKey(), "saltysalt", 1003, 16, "sha1");
    const iv = Buffer.alloc(16, " ");

    // Decrypt via openssl using spawnSync for clean binary output
    const tmpEnc = join(tmpdir(), `slk_enc_${Date.now()}.bin`);
    writeFileSync(tmpEnc, data);

    const result = spawnSync("openssl", [
      "enc", "-aes-128-cbc", "-d", "-nopad",
      "-K", aesKey.toString("hex"),
      "-iv", iv.toString("hex"),
      "-in", tmpEnc,
    ]);
    const decrypted = result.stdout;

    unlinkSync(tmpEnc);

    if (!decrypted || decrypted.length === 0) {
      throw new Error("Cookie decryption failed");
    }

    // Remove PKCS7 padding
    const padLen = decrypted[decrypted.length - 1];
    const unpadded = padLen <= 16 ? decrypted.subarray(0, -padLen) : decrypted;
    const text = unpadded.toString("utf-8");

    const idx = text.indexOf("xoxd-");
    if (idx < 0) throw new Error("No xoxd- found in decrypted cookie");
    return text.substring(idx);
  } finally {
    try { unlinkSync(tmpDb); } catch {}
  }
}

function extractToken() {
  const files = readdirSync(LEVELDB_DIR).filter(
    (f) => f.endsWith(".ldb") || f.endsWith(".log")
  );

  const tokens = new Set();

  for (const file of files) {
    try {
      const raw = readFileSync(join(LEVELDB_DIR, file));
      const content = raw.toString("latin1");

      // Method 1: direct regex (works for uncompressed entries)
      for (const m of content.matchAll(/xoxc-[a-zA-Z0-9_-]{20,}/g)) {
        tokens.add(m[0]);
      }

      // Method 2: Snappy-compressed LevelDB blocks mangle tokens.
      // Use Python to properly decompress and extract from the JSON structure.
      // Skip here — handled in extractTokenPython() below.
    } catch {}
  }

  // Method 2: Use Python to extract tokens from Snappy-compressed LevelDB
  // Python's regex on binary-stripped data handles compression artifacts better
  try {
    const pyResult = spawnSync("python3", ["-c", `
import os, re
path = ${JSON.stringify(LEVELDB_DIR)}
for f in os.listdir(path):
    if not (f.endswith(".ldb") or f.endswith(".log")): continue
    data = open(os.path.join(path, f), "rb").read()
    # Find all xoxc- positions and extract by reading the hex tail
    pos = 0
    while True:
        idx = data.find(b"xoxc-", pos)
        if idx < 0: break
        pos = idx + 5
        chunk = data[idx:idx+200]
        # Find the 64-char hex tail
        text = chunk.decode("latin1")
        hm = re.search(r'[a-f0-9]{64}', text)
        if not hm: continue
        # Get all bytes from xoxc- to end of hex tail
        end = text.index(hm.group()) + 64
        raw = chunk[:end]
        # Keep only printable token chars
        clean = bytes(b for b in raw if chr(b) in '0123456789abcdef-xoc').decode()
        # Validate structure
        if re.match(r'^xoxc-\\d+-\\d+-\\d+-[a-f0-9]{64}$', clean):
            print(clean)
`], { encoding: "utf-8", timeout: 5000 });
    if (pyResult.stdout) {
      for (const line of pyResult.stdout.trim().split("\n")) {
        if (line.startsWith("xoxc-")) tokens.add(line);
      }
    }
  } catch {}

  // Method 3: Scan IndexedDB blob files (fallback when LevelDB has no tokens)
  if (tokens.size === 0) {
    const idbBase = join(SLACK_DIR, "IndexedDB");
    try {
      const scanDir = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(full);
          } else {
            try {
              const raw = readFileSync(full);
              const content = raw.toString("latin1");
              for (const m of content.matchAll(/xoxc-[a-zA-Z0-9_.-]{20,}/g)) {
                tokens.add(m[0]);
              }
            } catch {}
          }
        }
      };
      if (existsSync(idbBase)) scanDir(idbBase);
    } catch {}
  }

  if (tokens.size === 0) {
    throw new Error("No xoxc- token found. Is Slack running?");
  }

  // Return all candidates sorted by length desc; caller will validate
  return [...tokens]
    .filter((t) => t.length > 50) // filter truncated tokens
    .sort((a, b) => b.length - a.length);
}

function loadTokenCache() {
  try {
    if (existsSync(TOKEN_CACHE)) {
      return JSON.parse(readFileSync(TOKEN_CACHE, "utf-8"));
    }
  } catch {}
  return null;
}

function saveTokenCache(token, teamId = getActiveWorkspace() || "default") {
  try {
    mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 });
    writeFileSync(TOKEN_CACHE, JSON.stringify({ token, teamId, ts: Date.now() }), { mode: 0o600 });
  } catch {}
}

function validateToken(token, cookie) {
  try {
    const result = spawnSync("curl", [
      "-s", "https://slack.com/api/auth.test",
      "-H", `Authorization: Bearer ${token}`,
      "-b", `d=${cookie}`,
    ], { encoding: "utf-8", timeout: 10000 });
    const data = JSON.parse(result.stdout);
    return data.ok;
  } catch {
    return false;
  }
}

export function getCredentials(forceRefresh = false) {
  if (cachedCreds && !forceRefresh) return cachedCreds;

  const activeTeam = getActiveWorkspace();
  if (activeTeam) {
    try {
      return getCredentialsForTeam(activeTeam);
    } catch {
      // Fall through to default extraction
    }
  }

  const cookie = decryptCookie();

  if (!forceRefresh) {
    const cache = loadTokenCache();
    if (cache?.token && validateToken(cache.token, cookie)) {
      cachedCreds = { token: cache.token, cookie, teamId: cache.teamId || activeTeam || "default" };
      return cachedCreds;
    }
  }

  const config = extractLocalConfig();
  if (config?.teams) {
    const teamEntries = Object.values(config.teams);
    for (const team of teamEntries) {
      if (validateToken(team.token, cookie)) {
        saveTokenCache(team.token, team.id);
        cachedCreds = { token: team.token, cookie, teamId: team.id || activeTeam || "default" };
        return cachedCreds;
      }
    }
  }

  const candidates = extractToken();
  for (const token of candidates) {
    if (validateToken(token, cookie)) {
      saveTokenCache(token, activeTeam || "default");
      cachedCreds = { token, cookie, teamId: activeTeam || "default" };
      return cachedCreds;
    }
  }

  cachedCreds = { token: candidates[0], cookie, teamId: activeTeam || "default" };
  return cachedCreds;
}

export function refresh() {
  cachedCreds = null;
  return getCredentials(true);
}

// ── Snappy decompression (for LevelDB SSTable blocks) ──

function decodeVarint(buf, offset) {
  let result = 0, shift = 0;
  while (offset < buf.length) {
    const b = buf[offset++];
    result |= (b & 0x7f) << shift;
    if (!(b & 0x80)) return [result, offset];
    shift += 7;
  }
  return [result, offset];
}

function snappyDecompress(compressed) {
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

// ── localConfig_v2 extraction from LevelDB ──

function extractLocalConfig() {
  const files = readdirSync(LEVELDB_DIR).filter(
    (f) => f.endsWith(".ldb") || f.endsWith(".log")
  );

  for (const file of files.sort().reverse()) {
    try {
      const raw = readFileSync(join(LEVELDB_DIR, file));
      if (!raw.includes("localConfig_v2")) continue;

      if (file.endsWith(".log")) {
        const text = Buffer.from(raw.filter((b) => b !== 0)).toString("utf-8");
        const idx = text.indexOf('{"teams"');
        if (idx < 0) continue;
        let depth = 0, end = -1;
        for (let i = idx; i < text.length; i++) {
          if (text[i] === "{") depth++;
          else if (text[i] === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
        }
        if (end > 0) {
          try { return JSON.parse(text.substring(idx, end)); } catch {}
        }
        continue;
      }

      // .ldb files: parse SSTable index to find the right block
      const footerStart = raw.length - 48;
      let fpos = footerStart;
      const [, p1] = decodeVarint(raw, fpos);
      const [, p2] = decodeVarint(raw, p1);
      const [idxOff, p3] = decodeVarint(raw, p2);
      const [idxSize] = decodeVarint(raw, p3);

      const idxRaw = raw.subarray(idxOff, idxOff + idxSize);
      const idxCompression = raw[idxOff + idxSize];
      const idxData = idxCompression === 1 ? snappyDecompress(idxRaw) : idxRaw;

      const numRestarts = idxData.readUInt32LE(idxData.length - 4);
      const restartsOff = idxData.length - 4 - numRestarts * 4;

      let epos = 0;
      const blocks = [];
      while (epos < restartsOff) {
        const [shared, q1] = decodeVarint(idxData, epos);
        const [nonShared, q2] = decodeVarint(idxData, q1);
        const [valueLen, q3] = decodeVarint(idxData, q2);
        const value = idxData.subarray(q3 + nonShared, q3 + nonShared + valueLen);
        const [bOff, bp1] = decodeVarint(value, 0);
        const [bSize] = decodeVarint(value, bp1);
        blocks.push({ offset: bOff, size: bSize });
        epos = q3 + nonShared + valueLen;
      }

      for (const b of blocks) {
        try {
          const blockRaw = raw.subarray(b.offset, b.offset + b.size);
          const compression = raw[b.offset + b.size];
          const data = compression === 1 ? snappyDecompress(blockRaw) : blockRaw;

          const stripped = Buffer.from(data.filter((byte) => byte !== 0));
          const text = stripped.toString("utf-8");
          if (!text.includes("localConfig")) continue;

          const teamPattern =
            /"(T[A-Z0-9]+)":\{"id":"(T[A-Z0-9]+)","name":"([^"]*)","url":"([^"]*)","domain":"([^"]*)","token":"(xoxc-[^"]*)"/g;
          const teams = {};
          let m;
          while ((m = teamPattern.exec(text)) !== null) {
            teams[m[1]] = { id: m[1], name: m[3], url: m[4], domain: m[5], token: m[6] };
          }
          if (Object.keys(teams).length > 0) return { teams };
        } catch {}
      }
    } catch {}
  }
  return null;
}

// ── Workspace management ──

export function listWorkspaces() {
  const config = extractLocalConfig();
  if (!config?.teams) {
    console.error("Could not extract workspace list from Slack app data.");
    process.exit(1);
  }
  return config.teams;
}

export function getActiveWorkspace() {
  try {
    if (existsSync(ACTIVE_WORKSPACE)) {
      return readFileSync(ACTIVE_WORKSPACE, "utf-8").trim();
    }
  } catch {}
  return null;
}

export function setActiveWorkspace(teamId) {
  mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(ACTIVE_WORKSPACE, teamId, { mode: 0o600 });
  try { unlinkSync(TOKEN_CACHE); } catch {}
  cachedCreds = null;
}

export function getActiveWorkspaceContext() {
  return { teamId: getActiveWorkspace() || "default" };
}

export function getCredentialsForTeam(teamId) {
  const config = extractLocalConfig();
  if (!config?.teams?.[teamId]) {
    throw new Error(`Workspace ${teamId} not found in Slack app data.`);
  }
  const team = config.teams[teamId];
  const cookie = decryptCookie();
  if (!validateToken(team.token, cookie)) {
    throw new Error(`Workspace ${teamId} token is no longer valid. Re-open Slack or sign in again.`);
  }
  cachedCreds = { token: team.token, cookie, teamId };
  saveTokenCache(team.token, teamId);
  return cachedCreds;
}
