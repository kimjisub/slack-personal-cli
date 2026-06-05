/**
 * Output helpers. `emit` switches between human and `--json` rendering; `die`
 * is the single error-exit path so commands report failures consistently.
 */

/**
 * Print a "Error: …" line to stderr and exit non-zero.
 * @param {unknown} message  A string, or an Error/unknown thrown value.
 * @returns {never}
 */
export function die(message) {
  const text = message instanceof Error ? message.message : String(message);
  console.error(`Error: ${text}`);
  process.exit(1);
}

let jsonMode = false;

export function setJsonMode(on) {
  jsonMode = Boolean(on);
}

export function isJsonMode() {
  return jsonMode;
}

export function emit(data, renderHuman) {
  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  renderHuman();
}
