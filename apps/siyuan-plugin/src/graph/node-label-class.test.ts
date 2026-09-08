import { expect, it } from "vitest";
import { nodeLabelClass } from "./node-label-class";

it("marks regular external labels by displayed ID while keeping chosen labels distinct and titles literal", () => {
  const common = { label: "<b>Same title</b>", notebook: "", path: "", degree: 0, color: "#fff" };
  const displayed = {
    idToIndex: new Map([["local", 0], ["outside", 1]]),
    indexToNode: [
      Object.freeze({ ...common, id: "local", index: 0 }),
      Object.freeze({ ...common, id: "outside", index: 1, external: true }),
    ],
  };
  expect(nodeLabelClass(displayed, "outside", false)).toBe("ag-graph-label ag-graph-label--external");
  expect(nodeLabelClass(displayed, "outside", true)).toBe("ag-graph-label ag-graph-label--chosen ag-graph-label--external");
  expect(nodeLabelClass(displayed, "local", false)).toBe("ag-graph-label");
  expect(nodeLabelClass(displayed, "removed", false)).toBe("ag-graph-label");
  expect(displayed.indexToNode[1].label).toBe("<b>Same title</b>");
});
