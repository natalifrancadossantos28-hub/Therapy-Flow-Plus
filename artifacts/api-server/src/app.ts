import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";

const app: Express = express();

const CUSTOM_HEADERS = ["content-type", "x-company-id", "x-company-auth", "x-master-auth"];

const allowedPatterns = [
  /^https?:\/\/localhost(:\d+)?$/,
  /\.replit\.dev$/,
  /\.replit\.app$/,
  /\.vercel\.app$/,
];

const extraOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed =
        allowedPatterns.some((p) => p.test(origin)) ||
        extraOrigins.includes(origin);
      if (allowed) return callback(null, true);
      callback(new Error(`CORS: origem não permitida — ${origin}`));
    },
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: CUSTOM_HEADERS,
    credentials: false,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api", router);

export default app;
