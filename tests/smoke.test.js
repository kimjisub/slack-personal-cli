import test from "node:test";
import assert from "node:assert/strict";

import * as api from "../src/api.js";

test("api module exports slackApi", () => {
  assert.equal(typeof api.slackApi, "function");
});
