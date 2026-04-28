function flattenObject(value, prefix = "", out = {}) {
  if (value === null || value === undefined) {
    out[prefix] = value;
    return out;
  }
  if (Array.isArray(value)) {
    out[prefix] = JSON.stringify(value);
    return out;
  }
  if (typeof value !== "object") {
    out[prefix] = value;
    return out;
  }
  for (const [key, child] of Object.entries(value)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) flattenObject(child, next, out);
    else if (Array.isArray(child)) out[next] = JSON.stringify(child);
    else out[next] = child;
  }
  return out;
}

export function flattenRows(payload) {
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.messages)) return payload.messages;
  if (Array.isArray(payload?.recentMessages)) return payload.recentMessages;
  if (Array.isArray(payload?.channels)) return payload.channels;
  if (Array.isArray(payload?.topParticipants)) return payload.topParticipants;
  return [];
}

export function formatExport(rows, format = "json") {
  if (format === "json") return JSON.stringify(rows, null, 2);
  if (format === "ndjson") return rows.map((row) => JSON.stringify(row)).join("\n");
  if (format === "csv") {
    const flatRows = rows.map((row) => flattenObject(row));
    const headers = [...new Set(flatRows.flatMap((row) => Object.keys(row)))];
    const escape = (value) => {
      const str = value === null || value === undefined ? "" : String(value);
      return /[",\n]/.test(str) ? `"${str.replaceAll('"', '""')}"` : str;
    };
    return [headers.join(","), ...flatRows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\n");
  }
  throw new Error(`Unsupported export format: ${format}`);
}

export function detectCheckpointTs(payload) {
  const candidates = [];
  const pushTs = (value) => {
    if (!value) return;
    candidates.push(String(value));
  };
  for (const row of flattenRows(payload)) {
    pushTs(row?.ts);
    pushTs(row?.threadTs);
    pushTs(row?.rootMessage?.ts);
  }
  if (payload?.recentMessages) {
    for (const row of payload.recentMessages) pushTs(row?.ts);
  }
  return candidates.sort().at(-1) || null;
}

export function summarizeWatchChange(previousPayload, currentPayload) {
  const previousRows = flattenRows(previousPayload);
  const currentRows = flattenRows(currentPayload);
  const previousCount = previousPayload?.total ?? previousRows.length;
  const currentCount = currentPayload?.total ?? currentRows.length;
  const previousTs = detectCheckpointTs(previousPayload);
  const latestTs = detectCheckpointTs(currentPayload);
  return {
    changed: previousCount !== currentCount || previousTs !== latestTs,
    previousCount,
    currentCount,
    latestTs,
  };
}
