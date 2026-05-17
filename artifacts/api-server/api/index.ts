// Vercel serverless entry — exports the Express app (no listen)
// @ts-ignore — Vercel's @vercel/node runtime resolves .ts files automatically
import app from "../src/app";
export default app;
