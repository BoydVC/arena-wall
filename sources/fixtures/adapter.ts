import { buildFixtureLog } from "./build.ts";
import { roster } from "./catalog.ts";
import type { LogEntry } from "../../core/types.ts";
import type { Roster } from "./catalog.ts";

/** Default source. No network, no forge writes. */
export function loadFixtureLog(): LogEntry[] {
  return buildFixtureLog();
}

export function loadFixtureRoster(): Roster {
  return roster;
}
