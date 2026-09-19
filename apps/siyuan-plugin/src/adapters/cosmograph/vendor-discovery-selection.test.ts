import { expect, it, vi } from "vitest";
import { Cosmograph } from "@cosmograph/cosmograph";

it("uses installed public selection APIs to retain exactly the evidence edges", () => {
  const points = new Set<number>(),
    links = new Set<number>();
  const wrapper = Object.setPrototypeOf(
    {
      _cosmos: {},
      _computeWithNeighborsLinks: vi.fn(() => [0, 1, 2]),
      _crossfilter: {
        userSelectedPointIndices: points,
        clearUserSelectedPointIndices: () => points.clear(),
        clearUserSelectedLinkIndices: () => links.clear(),
        setUserSelectedLinkIndices: (ids: number[]) => {
          links.clear();
          for (const id of ids) links.add(id);
        },
        addUserSelectedPointIndices: (ids: number[]) => {
          for (const id of ids) points.add(id);
        },
        setUserSelectedPointIndices: (ids: number[]) => {
          points.clear();
          for (const id of ids) points.add(id);
        },
        addUserSelectedLinkIndices: (ids: number[]) => {
          for (const id of ids) links.add(id);
        },
      },
    },
    Cosmograph.prototype,
  );
  wrapper.selectLinks([1], false, false);
  wrapper.selectPoints([0, 2], true, false);
  expect([...links]).toEqual([1]);
  expect([...points]).toEqual([0, 2]);
  expect(wrapper._computeWithNeighborsLinks).not.toHaveBeenCalled();
  wrapper.selectPoints([0], false, true);
  expect([...links]).toEqual([0, 1, 2]);
  expect([...points]).toEqual([0]);
});
