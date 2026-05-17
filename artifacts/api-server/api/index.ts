// Vercel serverless entry — delegates to esbuild-bundled app
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const app = require("../.vercel-build/app.cjs");
export default app.default ?? app;
