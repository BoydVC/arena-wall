import fs from "node:fs";
import path from "node:path";
import { lintSpec } from "../../core/specLint.ts";
import type { LogEntry } from "../../core/types.ts";

/**
 * Watch a folder of markdown specs and emit `spec.linted` when a file changes.
 * The idea id is the file name, unless the file names one in an HTML comment.
 */
export function watchSpecs(dir: string, onEntry: (entry: LogEntry) => void): () => void {
  if (!fs.existsSync(dir)) return () => undefined;
  const seen = new Map<string, string>();
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".md")) continue;
    const full = path.join(dir, file);
    seen.set(full, fs.readFileSync(full, "utf8"));
  }

  const timer = setInterval(() => {
    let names: string[] = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const file of names) {
      if (!file.endsWith(".md")) continue;
      const full = path.join(dir, file);
      let text = "";
      try {
        text = fs.readFileSync(full, "utf8");
      } catch {
        continue;
      }
      if (seen.get(full) === text) continue;
      seen.set(full, text);
      const ideaId = ideaIdFrom(file, text);
      if (!ideaId) continue;
      onEntry({
        at: new Date().toISOString(),
        event: {
          t: "spec.linted",
          ideaId,
          report: lintSpec(text, path.relative(process.cwd(), full).split(path.sep).join("/")),
        },
      });
    }
  }, 250);

  return () => clearInterval(timer);
}

function ideaIdFrom(file: string, text: string): string | null {
  const comment = text.match(/<!--\s*idea:\s*([a-z0-9-]+)\s*-->/i);
  if (comment?.[1]) return comment[1];
  const base = path.basename(file, ".md");
  if (base.toLowerCase() === "readme") return null;
  return base;
}
