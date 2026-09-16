import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import {
  boundaryViolation,
  checkBoundaries,
} from "../apps/siyuan-plugin/scripts/check-boundaries.mjs";

test("core and capability imports cannot reverse the intended ownership", () => {
  assert.ok(boundaryViolation("core/graph/types.ts", "modules/mentions/types.ts"));
  assert.ok(boundaryViolation("modules/mentions/ui/Controls.tsx", "workbench/model/state.tsx"));
  assert.ok(boundaryViolation("application/sessions/commands.ts", "adapters/wasm/client.ts"));
  assert.ok(
    boundaryViolation("application/sessions/commands.ts", "modules/mentions/use-mentions.ts"),
  );
  assert.ok(boundaryViolation("shared/async/requests.ts", "application/sessions/commands.ts"));
});

test("concrete composition and consumer-owned presentation contracts remain allowed", () => {
  assert.equal(
    boundaryViolation("bootstrap/workbench.tsx", "adapters/cosmograph/Canvas.tsx"),
    null,
  );
  assert.equal(
    boundaryViolation("adapters/cosmograph/Canvas.tsx", "workbench/presentation/types.ts"),
    null,
  );
  assert.equal(
    boundaryViolation("application/workflows/filters.ts", "modules/presets/model.ts"),
    null,
  );
  assert.equal(boundaryViolation("modules/mentions/matcher.ts", "core/graph/types.ts"), null);
});

test("the complete source tree obeys layer and Worker boundaries", () => {
  assert.deepEqual(checkBoundaries(resolve(import.meta.dirname, "../apps/siyuan-plugin/src")), []);
});
