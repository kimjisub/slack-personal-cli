/**
 * User presence status — sets the custom status (text + emoji) via
 * users.profile.set, mirroring the "Update your status" UI in Slack.
 */

import { slackApi } from "./api.js";
import { emit, die } from "./output.js";

/**
 * Set your custom status.
 * @param {string} text             Status text (e.g. "In a meeting").
 * @param {string} [emoji]          Emoji name, with or without colons.
 * @param {number} [expireMinutes]  Auto-clear after N minutes (0 = no expiry).
 */
export async function setStatus(text, emoji = "", expireMinutes = 0) {
  const profile = {
    status_text: text,
    status_emoji: emoji ? `:${emoji.replace(/:/g, "")}:` : "",
  };
  if (expireMinutes > 0) {
    profile.status_expiration = Math.floor(Date.now() / 1000) + expireMinutes * 60;
  }

  const data = await slackApi("users.profile.set", { profile });
  if (!data.ok) die(data.error);
  emit({ ok: true, profile }, () => {
    const tag = profile.status_emoji ? `${profile.status_emoji} ` : "";
    console.log(`✅ Status set: ${tag}${text}`);
  });
}

/** Clear your custom status. */
export async function clearStatus() {
  const data = await slackApi("users.profile.set", {
    profile: { status_text: "", status_emoji: "" },
  });
  if (!data.ok) die(data.error);
  emit({ ok: true }, () => console.log("✅ Status cleared"));
}
