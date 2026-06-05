/**
 * Orchestration for per-workspace "section" commands (inbox, owed): resolve the
 * scope, compute one value per target (fanning out for `-A`), then emit the
 * combined result either as JSON or as human sections with a failure summary.
 *
 * Commands supply three callbacks so this stays agnostic of their data shape:
 *   compute(creds, team) -> value         // one workspace's data; may throw
 *   toJson(value, label) -> object        // one workspace's JSON entry
 *   render(value, label) -> void          // print one workspace's section
 */

import {
  resolveScope,
  resolveTargets,
  mapWorkspaces,
  workspaceLabel,
} from "./workspaces.js";
import { emit } from "./output.js";

/**
 * @template V
 * @typedef {object} ScopedConfig
 * @property {(creds: object|null, team: object|null) => Promise<V>} compute
 * @property {(value: V, label: string|null) => object} toJson
 * @property {(value: V, label: string|null) => void} render
 * @property {Record<string, unknown>} [extra]
 * @property {number} [concurrency]
 */

/**
 * @template V
 * @param {object} opts                Scope flags ({ workspace?, all? }).
 * @param {ScopedConfig<V>} config     Per-command compute/toJson/render callbacks.
 * @returns {Promise<void>}
 */
export async function runScopedSections(
  opts,
  { compute, toJson, render, extra = {}, concurrency } = /** @type {any} */ ({})
) {
  const scope = resolveScope(opts);
  const targets = resolveTargets(scope);

  /** @type {Array<{ label: string|null, value?: V, error?: Error }>} */
  let sections;
  if (targets.length === 1) {
    // Single target: let errors propagate to the top-level handler (exit 1).
    const value = await compute(targets[0].creds, targets[0].team);
    const label = scope.mode === "one" ? workspaceLabel(targets[0].team) : null;
    sections = [{ label, value }];
  } else {
    const results = await mapWorkspaces(targets, compute, { concurrency });
    sections = results.map((r) => ({
      label: workspaceLabel(r.team),
      value: r.value,
      error: r.error,
    }));
  }

  const failed = sections.filter((s) => s.error).map((s) => s.label);
  /** @type {Array<{ label: string|null, value: V }>} */
  const ok = sections
    .filter((s) => !s.error)
    .map((s) => ({ label: s.label, value: /** @type {V} */ (s.value) }));

  emit(
    {
      scope: scope.mode,
      ...extra,
      workspaces: ok.map((s) => toJson(s.value, s.label)),
      failed,
    },
    () => {
      for (const s of ok) render(s.value, s.label);
      if (failed.length) {
        console.log(
          `\n⚠️  ${failed.length} workspace(s) failed: ${failed.join(", ")}`
        );
      }
    }
  );
}
