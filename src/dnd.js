/**
 * Do Not Disturb — snooze notifications for N minutes, end an active snooze,
 * and check current DnD state.
 */

import { slackApi } from "./api.js";
import { emit, die } from "./output.js";
import { formatTs } from "./render.js";

/**
 * Snooze notifications.
 * @param {string|number} minutes  How long to snooze.
 */
export async function snooze(minutes) {
  const num = parseInt(String(minutes), 10);
  if (!Number.isFinite(num) || num <= 0) die("Usage: slk dnd <minutes>");
  const data = await slackApi("dnd.setSnooze", { num_minutes: num });
  if (!data.ok) die(data.error);
  emit({ ok: true, snooze_endtime: data.snooze_endtime }, () => {
    const until = data.snooze_endtime ? ` until ${formatTs(String(data.snooze_endtime))}` : "";
    console.log(`🔕 Do Not Disturb for ${num} min${until}`);
  });
}

/** End an active snooze. */
export async function endSnooze() {
  const data = await slackApi("dnd.endSnooze", {});
  if (!data.ok) die(data.error);
  emit({ ok: true }, () => console.log("🔔 Snooze ended"));
}

/** Show current Do Not Disturb state. */
export async function dndStatus() {
  const data = await slackApi("dnd.info", {});
  if (!data.ok) die(data.error);
  emit({ ok: true, dnd: data }, () => {
    const snoozing = data.snooze_enabled
      ? ` (snoozed until ${formatTs(String(data.snooze_endtime))})`
      : "";
    console.log(`DnD: ${data.dnd_enabled ? "on" : "off"}${snoozing}`);
  });
}
