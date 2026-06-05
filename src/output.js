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

/** Enable or disable global `--json` output. @param {boolean} on */
export function setJsonMode(on) {
  jsonMode = Boolean(on);
}

/** @returns {boolean} whether `--json` output is active */
export function isJsonMode() {
  return jsonMode;
}

/**
 * Emit a command result: serialize `data` when `--json` is active, otherwise
 * run `renderHuman` for terminal output.
 * @param {unknown} data           Machine-readable result.
 * @param {() => void} renderHuman  Human renderer, called only in non-JSON mode.
 */
export function emit(data, renderHuman) {
  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  renderHuman();
}
