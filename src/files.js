/**
 * File transfer — uploads use Slack's current three-step external flow
 * (getUploadURLExternal → POST bytes → completeUploadExternal); downloads
 * fetch a file's authenticated url_private.
 */

import { readFileSync, statSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { slackApi } from "./api.js";
import { emit, die } from "./output.js";
import { resolveChannel } from "./commands.js";
import { getCredentials } from "./auth.js";

/**
 * Upload a local file and (optionally) share it to a channel/thread.
 * @param {string} filePath
 * @param {string} channelRef
 * @param {{ threadTs?: string, comment?: string }} [opts]
 */
export async function uploadFile(filePath, channelRef, opts = {}) {
  const channel = await resolveChannel(channelRef);

  let size, bytes, name;
  try {
    size = statSync(filePath).size;
    bytes = readFileSync(filePath);
    name = basename(filePath);
  } catch {
    return die(`Cannot read file: ${filePath}`);
  }

  // Step 1 — reserve an upload URL and file id.
  const reserved = await slackApi("files.getUploadURLExternal", { filename: name, length: size });
  if (!reserved.ok) die(reserved.error);

  // Step 2 — POST the raw bytes to the one-time upload URL.
  const put = await fetch(reserved.upload_url, { method: "POST", body: bytes });
  if (!put.ok) die(`Upload failed: HTTP ${put.status}`);

  // Step 3 — finalize and share.
  const params = { files: [{ id: reserved.file_id, title: name }] };
  if (channel) params.channel_id = channel;
  if (opts.threadTs) params.thread_ts = opts.threadTs;
  if (opts.comment) params.initial_comment = opts.comment;

  const done = await slackApi("files.completeUploadExternal", params);
  if (!done.ok) die(done.error);
  emit({ ok: true, file: done.files?.[0] }, () => {
    console.log(`📎 Uploaded ${name} → ${channelRef}`);
  });
}

/**
 * Download a file by id to a local path.
 * @param {string} fileId
 * @param {string|null} [outPath]  Defaults to the file's own name.
 */
export async function downloadFile(fileId, outPath = null) {
  const info = await slackApi("files.info", { file: fileId });
  if (!info.ok) die(info.error);

  const url = info.file?.url_private_download || info.file?.url_private;
  if (!url) die("No download URL for this file.");

  const { token, cookie } = getCredentials();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Cookie: `d=${cookie}` },
  });
  if (!res.ok) die(`Download failed: HTTP ${res.status}`);

  const buf = Buffer.from(await res.arrayBuffer());
  const dest = outPath || info.file?.name || fileId;
  writeFileSync(dest, buf);
  emit({ ok: true, path: dest, bytes: buf.length }, () => {
    console.log(`💾 Downloaded → ${dest} (${buf.length} bytes)`);
  });
}
