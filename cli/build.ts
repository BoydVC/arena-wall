import { build } from "esbuild";

export async function buildUi(): Promise<void> {
  await build({
    entryPoints: ["ui/main.ts"],
    bundle: true,
    outfile: "ui/app.js",
    format: "esm",
    target: "es2022",
    logLevel: "silent",
  });
}

const entry = process.argv[1] ?? "";
if (entry.endsWith("build.ts")) {
  await buildUi();
}
