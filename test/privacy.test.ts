import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { denyTerms } from "../core/deny.ts";
import { scanWorkingTree } from "../core/privacy.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("privacy deny list", () => {
  it("keeps the terms in the gitignored deny file and nowhere else", () => {
    const denyPath = path.join(root, ".arena-wall", "deny.txt");
    fs.mkdirSync(path.dirname(denyPath), { recursive: true });
    fs.writeFileSync(denyPath, `${denyTerms().join("\n")}\n`);
    const hits = scanWorkingTree(root);
    expect(hits).toEqual([]);
  });

  it("matches a short token on a boundary and ignores a longer word", () => {
    const source = fs.readFileSync(path.join(root, "docs/lifecycle.md"), "utf8");
    expect(source.toLowerCase()).toContain("statechart");
    expect(scanWorkingTree(root)).toEqual([]);
  });
});
