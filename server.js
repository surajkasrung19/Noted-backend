import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import connectDB from "./src/config/db.js";
import notesRouter from "./src/routes/notes.js";
import foldersRouter from "./src/routes/folders.js";
import tagsRouter from "./src/routes/tags.js";
import uploadsRouter from "./src/routes/uploads.js";
import remindersRouter from "./src/routes/reminders.js";
import authRouter from "./src/routes/auth.js";
import { requireAuth } from "./src/middleware/auth.js";
import { startReminderWorker } from "./src/services/reminderWorker.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

const allowedOrigins = new Set(
  [
    process.env.CLIENT_URL,
    "http://localhost:5173"
  ].filter(Boolean)
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    }
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "Noted API" });
});

app.use("/api/auth", authRouter);
app.use("/api/notes", requireAuth, notesRouter);
app.use("/api/folders", requireAuth, foldersRouter);
app.use("/api/tags", requireAuth, tagsRouter);
app.use("/api/uploads", requireAuth, uploadsRouter);
app.use("/api/reminders", requireAuth, remindersRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({
    message: err.message || "Something went wrong"
  });
});

await connectDB();

app.listen(port, () => {
  console.log(`Noted API running on http://localhost:${port}`);
  startReminderWorker();
});
