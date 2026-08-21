import type { Express } from "express";
import { sdk } from "./_core/sdk";
import { storagePut } from "./storage";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^_+/, "").slice(0, 120) || "attachment";
}

export function registerEduconnectUploadRoutes(app: Express) {
  app.post("/api/educonnect/uploads", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      const { filename, contentType, base64, purpose } = req.body ?? {};
      if (typeof filename !== "string" || typeof contentType !== "string" || typeof base64 !== "string") {
        res.status(400).json({ error: "filename, contentType, and base64 are required." });
        return;
      }
      if (!ALLOWED_TYPES.has(contentType)) {
        res.status(415).json({ error: "This file type is not permitted." });
        return;
      }
      const data = Buffer.from(base64, "base64");
      if (!data.length || data.length > MAX_UPLOAD_BYTES) {
        res.status(413).json({ error: "Files must be between 1 byte and 8 MB." });
        return;
      }
      const segment = purpose === "lesson" ? "lesson-resources" : "assignment-submissions";
      const stored = await storagePut(`educonnect/${user.id}/${segment}/${safeFilename(filename)}`, data, contentType);
      res.status(201).json({ key: stored.key, url: stored.url, filename: safeFilename(filename) });
    } catch (error) {
      console.error("[Educonnect Upload]", error);
      res.status(401).json({ error: "Authenticated upload failed." });
    }
  });
}
