/**
 * Workspace scope resolution and cross-workspace fan-out.
 *
 * Scope model (consistent across commands):
 *   - default        → active workspace (creds = null, slackApi uses the active one)
 *   - { workspace }  → one specific workspace (matched by id/domain/name)
 *   - { all: true }  → every logged-in workspace
 */

import { getAllWorkspaceCredentials } from "./auth.js";

export function resolveScope(opts = {}) {
  if (opts.all) return { mode: "all" };
  if (opts.workspace) return { mode: "one", query: String(opts.workspace) };
  return { mode: "active" };
}

function matchTeam(teams, query) {
  const q = query.toLowerCase();
  const list = Object.values(teams);
  return (
    list.find((t) => t.id?.toLowerCase() === q) ||
    list.find((t) => t.domain?.toLowerCase() === q) ||
    list.find((t) => t.name?.toLowerCase() === q) ||
    list.find(
      (t) =>
        t.name?.toLowerCase().includes(q) || t.domain?.toLowerCase().includes(q)
    ) ||
    null
  );
}

/**
 * Resolve a scope to a list of targets: [{ team, creds }].
 * For "active", creds is null so slackApi falls back to the active workspace
 * (and keeps its auto-refresh behavior).
 */
export function resolveTargets(scope) {
  if (scope.mode === "all") {
    return getAllWorkspaceCredentials();
  }

  if (scope.mode === "one") {
    const all = getAllWorkspaceCredentials();
    const teams = Object.fromEntries(all.map((a) => [a.team.id, a.team]));
    const team = matchTeam(teams, scope.query);
    if (!team) {
      const names = Object.values(teams)
        .map((t) => t.name || t.domain || t.id)
        .join(", ");
      throw new Error(
        `Workspace not found: ${scope.query}. Available: ${names}`
      );
    }
    return all.filter((a) => a.team.id === team.id);
  }

  return [{ team: null, creds: null }];
}

export function workspaceLabel(team) {
  // A name containing U+FFFD came back garbled from the desktop app's binary
  // store (non-ASCII multi-byte names lose information during extraction); fall
  // back to the ASCII domain/id so the label stays readable.
  const name = team?.name;
  const REPLACEMENT_CHAR = String.fromCharCode(0xfffd);
  if (name && !name.includes(REPLACEMENT_CHAR)) return name;
  return team?.domain || team?.id || "active";
}

/**
 * Run `fn(creds, team)` for each target with bounded concurrency.
 * Never rejects: a failing target resolves to `{ team, error }`, a succeeding
 * one to `{ team, value }`. Results preserve input order.
 */
export async function mapWorkspaces(targets, fn, { concurrency = 4 } = {}) {
  const results = new Array(targets.length);
  let next = 0;

  async function worker() {
    while (next < targets.length) {
      const i = next;
      next += 1;
      const t = targets[i];
      try {
        results[i] = { team: t.team, value: await fn(t.creds, t.team) };
      } catch (error) {
        results[i] = { team: t.team, error };
      }
    }
  }

  const workers = Math.min(Math.max(1, concurrency), targets.length || 1);
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}
