import { describe, expect, it } from "vitest";
import { nextOccupiedLane } from "../core/nav.ts";
import type { Lane } from "../core/types.ts";

describe("nextOccupiedLane", () => {
  it("returns null when no lane has cards", () => {
    expect(nextOccupiedLane([], "idea", 1)).toBeNull();
    expect(nextOccupiedLane([], "parked", -1)).toBeNull();
  });

  it("skips empty lanes by walking only the occupied list", () => {
    const occupied: Lane[] = ["idea", "spec", "merged"];
    expect(nextOccupiedLane(occupied, "idea", 1)).toBe("spec");
    expect(nextOccupiedLane(occupied, "spec", 1)).toBe("merged");
    expect(nextOccupiedLane(occupied, "merged", 1)).toBe("idea");
    expect(nextOccupiedLane(occupied, "merged", -1)).toBe("spec");
  });

  it("treats a current lane that is empty as index 0", () => {
    const occupied: Lane[] = ["spec", "merged"];
    expect(nextOccupiedLane(occupied, "parked", 1)).toBe("merged");
  });
});
