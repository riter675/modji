import { describe, expect, it } from "vitest";
import { distanceMeters, nearestRoutePoint } from "./route-matching";

describe("GPS route matching", () => {
  it("measures distance in meters", () => {
    expect(distanceMeters([0, 0], [0, 0])).toBe(0);
    expect(distanceMeters([0, 0], [0.001, 0])).toBeCloseTo(111.2, 0);
  });

  it("finds the closest point on the real route geometry", () => {
    expect(nearestRoutePoint([2.001, 48], [[2, 48], [2.001, 48], [2.002, 48]])).toEqual({ index: 1, distanceMeters: 0 });
  });
});
