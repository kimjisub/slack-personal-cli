/**
 * Output mode switch. Commands build plain data and call `emit(data, renderHuman)`;
 * with `--json` active the data is serialized, otherwise the human renderer runs.
 */

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
