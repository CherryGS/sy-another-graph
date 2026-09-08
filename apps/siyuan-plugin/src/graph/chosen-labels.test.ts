import { describe, expect, it, vi } from "vitest";
import { ChosenLabels } from "./chosen-labels";
import type { PreparedGraph } from "./prepare-graph";
import type { PointPosition } from "./geometry";

class ElementStub extends EventTarget {
  readonly children: ElementStub[] = [];
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  readonly attributes: Record<string, string> = {};
  parent?: ElementStub;
  className = "";
  textContent = "";
  hidden = false;
  type = "";
  readonly ownerDocument = { createElement: () => new ElementStub() };
  appendChild(child: ElementStub) {
    child.parent = this;
    this.children.push(child);
    return child;
  }
  remove() {
    if (this.parent)
      this.parent.children.splice(this.parent.children.indexOf(this), 1);
  }
  setAttribute(key: string, value: string) {
    this.attributes[key] = value;
  }
  set innerHTML(_value: string) {
    throw new Error("Source labels must never use HTML");
  }
}

function prepared(count: number): PreparedGraph {
  const indexToNode = Array.from({ length: count }, (_, index) => ({
    id: `id-${index}`,
    label: index ? `Node ${index}` : "<img src='invalid'>",
    index,
    degree: 0,
    notebook: "",
    path: "",
    color: "#000000",
  }));
  return {
    config: {},
    indexToNode,
    indexToEdge: [],
    indexToId: indexToNode.map((node) => node.id),
    indexToLabel: indexToNode.map((node) => node.label),
    idToIndex: new Map(indexToNode.map((node) => [node.id, node.index])),
    pointsCount: count,
    linksCount: 0,
    preparationMs: 0,
  };
}

function harness(count = 2) {
  const host = new ElementStub();
  const frames = new Map<number, () => void>();
  let next = 0;
  const clicked = vi.fn();
  const hover = vi.fn();
  const geometry = {
    is3D: false,
    getPointPositions: vi.fn(() =>
      Float32Array.from({ length: count * 2 }, (_, index) => index + 10),
    ),
    spaceToScreenPosition: vi.fn(
      (position: PointPosition): [number, number] => [
        position[0] * 2,
        position[1] * 2,
      ],
    ),
    getPointScreenRadiusByIndex: vi.fn(() => 4),
  };
  const labels = new ChosenLabels(
    host as unknown as HTMLElement,
    geometry,
    clicked,
    hover,
    {
      frame(callback) {
        frames.set(++next, callback);
        return next;
      },
      cancelFrame(id) {
        frames.delete(id);
      },
    },
  );
  const draw = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback();
  };
  return { host, frames, geometry, labels, clicked, hover, draw };
}

describe("persistent chosen labels", () => {
  it("does not read the full position buffer on simulation ticks for pinned labels or camera-only changes", () => {
    const h = harness();
    h.labels.update(prepared(2), ["id-0", "id-1"]);
    h.draw();
    h.geometry.getPointPositions.mockClear();
    for (let tick = 0; tick < 60; tick++) {
      h.labels.refresh("simulation");
      h.draw();
    }
    expect(h.geometry.getPointPositions).not.toHaveBeenCalled();
    h.geometry.spaceToScreenPosition.mockImplementation((position) => [position[0] * 3, position[1] * 3]);
    h.labels.refresh("projection");
    h.draw();
    expect(h.geometry.getPointPositions).not.toHaveBeenCalled();
    expect(h.host.children[0].children[0].style.left).toBe("30px");
    h.labels.refresh();
    h.draw();
    expect(h.geometry.getPointPositions).toHaveBeenCalledTimes(1);
    h.labels.dispose();
  });

  it("keeps unpinned endpoint labels following simulation movement", () => {
    const h = harness();
    h.labels.update(prepared(2), ["id-0"], ["id-1"]);
    h.draw();
    h.geometry.getPointPositions.mockClear();
    h.geometry.getPointPositions.mockReturnValue(new Float32Array([10, 11, 50, 60]));
    h.labels.refresh("simulation");
    h.draw();
    expect(h.geometry.getPointPositions).toHaveBeenCalledTimes(1);
    expect(h.host.children[0].children[1].style.left).toBe("100px");
    h.labels.dispose();
  });

  it("uses XYZ stride and 3D projection, hiding positions behind the camera", () => {
    const h = harness();
    h.geometry.is3D = true;
    h.geometry.getPointPositions.mockReturnValue(new Float32Array([10, 20, 30, 40, 50, -60]));
    h.geometry.spaceToScreenPosition.mockImplementation((position) => (position[2] ?? 0) < 0 ? [NaN, NaN] : [position[0] + (position[2] ?? 0), position[1]]);
    h.labels.update(prepared(2), ["id-0", "id-1"]);
    h.draw();
    expect(h.geometry.getPointPositions).toHaveBeenCalledWith({ dimensions: 3 });
    expect(h.geometry.spaceToScreenPosition).toHaveBeenCalledWith([10, 20, 30], { dimensions: 3 });
    expect(h.host.children[0].children[0].style.left).toBe("40px");
    expect(h.host.children[0].children[1].style.visibility).toBe("hidden");
    h.labels.dispose();
  });

  it("creates every chosen label without the native 100-label limit and keeps source text literal", () => {
    const data = prepared(125);
    const h = harness(125);
    h.labels.update(data, data.indexToId);
    h.draw();
    const layer = h.host.children[0];
    expect(layer.children).toHaveLength(125);
    expect(layer.children[0].textContent).toBe("<img src='invalid'>");
    expect(layer.children[0].style.left).toBe("20px");
    expect(layer.children[0].style.top).toBe("11px");
    h.labels.dispose();
    expect(h.host.children).toHaveLength(0);
  });

  it("updates by stable ID, removes unchosen labels, and distinguishes auxiliary endpoints", () => {
    const data = prepared(3);
    const h = harness(3);
    h.labels.update(data, ["id-0", "id-0"], ["id-1"]);
    const layer = h.host.children[0];
    expect(layer.children).toHaveLength(2);
    expect(layer.children[1].className).toContain("--spotlight");
    h.labels.update(data, ["id-2", "missing"]);
    expect(layer.children).toHaveLength(1);
    expect(layer.children[0].dataset.graphNodeId).toBe("id-2");
    layer.children[0].dispatchEvent(new Event("click"));
    expect(h.clicked.mock.calls[0][0]).toBe("id-2");
    layer.children[0].dispatchEvent(new Event("mouseenter"));
    expect(h.hover).toHaveBeenCalledWith(data.indexToNode[2]);
    h.labels.dispose();
  });

  it("cancels geometry work while hidden and after disposal", () => {
    const h = harness();
    h.labels.update(prepared(2), ["id-0"]);
    const stale = h.frames.values().next().value!;
    h.labels.setActive(false);
    expect(h.frames.size).toBe(0);
    stale();
    expect(h.geometry.getPointPositions).not.toHaveBeenCalled();
    h.labels.setActive(true);
    h.draw();
    expect(h.geometry.getPointPositions).toHaveBeenCalledTimes(1);
    h.labels.refresh();
    const disposedFrame = h.frames.values().next().value!;
    h.labels.dispose();
    disposedFrame();
    expect(h.geometry.getPointPositions).toHaveBeenCalledTimes(1);
  });
});
