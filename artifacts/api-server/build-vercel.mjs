// Pre-bundles src/app.ts → .vercel-build/app.js so the serverless
// function in api/index.ts can import it without relying on
// @vercel/node's TypeScript compilation (which fails due to
// drizzle-orm type mismatches across workspace packages).

import path from "path";
import { fileURLToPath } from "url";
import { build } from "esbuild";
import { readFile } from "fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pkg = JSON.parse(await readFile(path.resolve(__dirname, "package.json"), "utf-8"));

const allDeps = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
];

// Bundle everything except native/binary packages
const external = allDeps.filter((dep) => ["esbuild", "tsx"].includes(dep));

await build({
  entryPoints: [path.resolve(__dirname, "src/app.ts")],
  platform: "node",
  bundle: true,
  format: "cjs",
  outfile: path.resolve(__dirname, ".vercel-build/app.cjs"),
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  minify: false,
  external,
  logLevel: "info",
});
