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

import { decodeVarint, snappyDecompress } from "./leveldb.js";

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

// Resolved lazily so that importing this module has no side effects. Unit tests
// (and CI) can pull it in transitively without a local Slack install; the dir is
// only resolved when a credential operation actually needs it.
let _paths = null;
function paths() {
  if (!_paths) {
    const dir = resolveSlackDir();
    _paths = {
      dir,
      leveldb: join(dir, "Local Storage", "leveldb"),
      cookies: join(dir, "Cookies"),
    };
  }
  return _paths;
}

const CACHE_DIR = join(homedir(), ".local", "slack-personal-cli");
const TOKEN_CACHE = join(CACHE_DIR, "token-cache.json");
const ACTIVE_WORKSPACE = join(CACHE_DIR, "active-workspace");

let cachedCreds = null;

function getKeychainKey() {
  // Mac App Store Slack uses account "Slack App Store Key", direct download uses "Slack" or "Slack Key"
  const accounts = paths().dir === SLACK_DIR_APPSTORE
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
  copyFileSync(paths().cookies, tmpDb);

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
  const files = readdirSync(paths().leveldb).filter(
    (f) => f.endsWith(".ldb") || f.endsWith(".log")
  );

  const tokens = new Set();

  for (const file of files) {
    try {
      const raw = readFileSync(join(paths().leveldb, file));
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
path = ${JSON.stringify(paths().leveldb)}
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
    const idbBase = join(paths().dir, "IndexedDB");
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

function saveTokenCache(token) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(TOKEN_CACHE, JSON.stringify({ token, ts: Date.now() }));
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

  // Preferred path: resolve the active workspace deterministically from
  // localConfig (env > active file > sole login > error). No silent guessing.
  const config = extractLocalConfig();
  if (config?.teams && Object.keys(config.teams).length > 0) {
    const { teamId } = resolveActiveWorkspace(config.teams);
    return getCredentialsForTeam(teamId);
  }

  // Fallback only when localConfig can't be parsed: scrape a token directly.
  return getCredentialsFromRawExtraction(forceRefresh);
}

/**
 * Last-resort credential resolution for machines where localConfig_v2 can't be
 * read from LevelDB. Validates the cached token, then any token scraped from
 * LevelDB/IndexedDB. Only reached when there's no parseable workspace list.
 */
function getCredentialsFromRawExtraction(forceRefresh = false) {
  const cookie = decryptCookie();

  if (!forceRefresh) {
    const cache = loadTokenCache();
    if (cache?.token && validateToken(cache.token, cookie)) {
      cachedCreds = { token: cache.token, cookie };
      return cachedCreds;
    }
  }

  const candidates = extractToken();
  for (const token of candidates) {
    if (validateToken(token, cookie)) {
      saveTokenCache(token);
      cachedCreds = { token, cookie };
      return cachedCreds;
    }
  }

  cachedCreds = { token: candidates[0], cookie };
  return cachedCreds;
}

export function refresh() {
  cachedCreds = null;
  return getCredentials(true);
}

// ── localConfig_v2 extraction from LevelDB ──

function extractLocalConfig() {
  const files = readdirSync(paths().leveldb).filter(
    (f) => f.endsWith(".ldb") || f.endsWith(".log")
  );

  for (const file of files.sort().reverse()) {
    try {
      const raw = readFileSync(join(paths().leveldb, file));
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
      const [, p1] = decodeVarint(raw, footerStart);
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
        const [, q1] = decodeVarint(idxData, epos);
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

/** Env var that overrides the active-workspace file (cf. AWS_PROFILE, DOCKER_CONTEXT). */
export const ACTIVE_WORKSPACE_ENV = "SLACK_CLI_WORKSPACE";

/**
 * Find a team id by exact id, then exact domain/name, then partial domain/name.
 * @param {Record<string, { id: string, name?: string, domain?: string }>} teams
 * @param {string} query
 * @returns {string|null} the matching team id, or null
 */
export function matchTeamId(teams, query) {
  const q = String(query).toLowerCase();
  const ids = Object.keys(teams);
  return (
    ids.find((id) => id.toLowerCase() === q) ||
    ids.find((id) => teams[id].domain?.toLowerCase() === q) ||
    ids.find((id) => teams[id].name?.toLowerCase() === q) ||
    ids.find(
      (id) =>
        teams[id].name?.toLowerCase().includes(q) ||
        teams[id].domain?.toLowerCase().includes(q)
    ) ||
    null
  );
}

/**
 * Single source of truth for which workspace "active" (no -w/-A) refers to.
 * Precedence mirrors mature multi-context CLIs (kubectl/aws/docker/gcloud):
 *   SLACK_CLI_WORKSPACE env  >  active-workspace file  >  sole login  >  error.
 * Both getCredentials() and `workspace current` resolve through this, so the
 * readout always matches what commands actually use.
 *
 * @param {Record<string, { id: string, name?: string, domain?: string, url?: string }>} teams
 * @returns {{ teamId: string, source: string }}
 * @throws if the env value matches nothing, or none is set with 2+ logins
 */
export function resolveActiveWorkspace(teams) {
  const env = process.env[ACTIVE_WORKSPACE_ENV];
  if (env) {
    const id = matchTeamId(teams, env);
    if (!id) {
      throw new Error(
        `${ACTIVE_WORKSPACE_ENV}="${env}" does not match any logged-in workspace.`
      );
    }
    return { teamId: id, source: `env (${ACTIVE_WORKSPACE_ENV})` };
  }

  const file = getActiveWorkspace();
  if (file && teams[file]) {
    return { teamId: file, source: "active workspace (workspace use)" };
  }

  const ids = Object.keys(teams);
  if (ids.length === 1) {
    return { teamId: ids[0], source: "sole logged-in workspace" };
  }

  throw new Error(
    "No active workspace selected. Pick one with `slk workspace use <name>`, " +
    `set ${ACTIVE_WORKSPACE_ENV}=<name>, or pass -w <name>.`
  );
}

export function setActiveWorkspace(teamId) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(ACTIVE_WORKSPACE, teamId);
  // Clear token cache so next getCredentials picks up the new workspace
  try { unlinkSync(TOKEN_CACHE); } catch {}
  cachedCreds = null;
}

export function getCredentialsForTeam(teamId) {
  const config = extractLocalConfig();
  if (!config?.teams?.[teamId]) {
    throw new Error(`Workspace ${teamId} not found in Slack app data.`);
  }
  const team = config.teams[teamId];
  const cookie = decryptCookie();
  cachedCreds = { token: team.token, cookie };
  saveTokenCache(team.token);
  return cachedCreds;
}

/**
 * Credentials for every logged-in workspace, for cross-workspace fan-out.
 * Reads localConfig + cookie once and does NOT touch the active-workspace cache,
 * so concurrent callers don't clobber each other's credentials.
 *
 * @returns {Array<{ team: { id: string, name?: string, domain?: string, url?: string, token?: string }, creds: { token: string, cookie: string } }>}
 */
export function getAllWorkspaceCredentials() {
  const config = extractLocalConfig();
  if (!config?.teams) {
    throw new Error("Could not extract workspace list from Slack app data.");
  }
  const cookie = decryptCookie();
  return Object.values(config.teams).map((team) => ({
    team,
    creds: { token: team.token, cookie },
  }));
}
