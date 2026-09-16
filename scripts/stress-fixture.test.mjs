import assert from "node:assert/strict";
import { test } from "node:test";
import { fixtureId, makeFixtureDocument, planStages, STAGES } from "./stress-fixture-data.mjs";

test("stages append deterministic native IDs and references only target current or prior documents", () => {
  const stamp = "20260909000000";
  const previous = makeFixtureDocument({ stamp, batch: 0, corpusExists: false });
  const current = makeFixtureDocument({ stamp, batch: 1, priorAnchors: previous.anchors });
  assert.deepEqual(
    current,
    makeFixtureDocument({ stamp, batch: 1, priorAnchors: previous.anchors }),
  );
  const previousIds = new Set(previous.ownedIds);
  const eligible = new Set([...current.ownedIds, ...previous.anchors]);
  assert.ok(current.ownedIds.every((id) => !previousIds.has(id)));
  let refs = 0;
  let self = 0;
  let cross = 0;
  for (const [source, targets] of Object.entries(current.referenceSources)) {
    assert.equal(new Set(targets).size, targets.length);
    assert.ok(targets.every((target) => eligible.has(target)));
    refs += targets.length;
    self += targets.includes(source) ? 1 : 0;
    cross += targets.filter((id) => previousIds.has(id)).length;
  }
  assert.equal(refs, current.expectedReferences);
  assert.ok(self > 0 && cross > 0);
  assert.ok(current.deepListLevels >= 12);
  assert.deepEqual(Object.keys(current.typeCounts).sort(), [
    "b",
    "c",
    "h",
    "i",
    "l",
    "m",
    "p",
    "s",
    "t",
  ]);
});

test("small pilot covers native structures without producing a large fixture", () => {
  const plan = makeFixtureDocument({
    stamp: "20260909000000",
    batch: 0,
    nativeBudget: 60,
    pilot: true,
  });
  assert.equal(plan.expectedDocumentBlocks, 60);
  assert.equal(plan.ownedIds.length, 59);
  assert.equal(plan.expectedReferences, 240);
  assert.ok(plan.markdown.includes("{{{row"));
  assert.ok(plan.markdown.includes("custom-atlas-stress-run"));
  assert.ok(plan.markdown.includes("- {: id="));
});

test("stage planning reports cumulative native counts and payload without writing notes", () => {
  const plans = planStages();
  assert.deepEqual(
    plans.map((plan) => plan.target),
    STAGES,
  );
  for (const plan of plans) {
    assert.ok(plan.fixtureBlocks >= plan.target && plan.fixtureBlocks < plan.target + 6);
    assert.equal(plan.addedReferences, plan.fixtureBlocks * 4);
    assert.ok(plan.createRequests > 0 && plan.markdownMiB > 0);
  }
  assert.ok(plans.at(-1).createRequests < 400);
});

test("invalid identity inputs fail before generation", () => {
  assert.throws(() => fixtureId("../../bad", 1));
  assert.throws(() => fixtureId("20260909000000", 36 ** 6));
  assert.throws(() => makeFixtureDocument({ stamp: "20260909000000", batch: -1 }));
});
