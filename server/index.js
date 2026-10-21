
import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const BACKEND_URL = "https://photo-app-27wa.onrender.com";

const uploadsDir = path.join(__dirname, "uploads");
const mediaFile = path.join(__dirname, "media.json");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(mediaFile)) {
  fs.writeFileSync(mediaFile, "[]", "utf8");
}

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname);
    cb(null, `${randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
});

function readMedia() {
  try {
    return JSON.parse(fs.readFileSync(mediaFile, "utf8") || "[]");
  } catch (error) {
    console.error("Error reading media.json:", error);
    return [];
  }
}

function saveMedia(media) {
  fs.writeFileSync(mediaFile, JSON.stringify(media, null, 2), "utf8");
}

function getMediaType(item) {
  const filename = (
    item.originalName ||
    item.filename ||
    item.name ||
    ""
  ).toLowerCase();

  const mimeType = (
    item.mimetype ||
    item.mimeType ||
    ""
  ).toLowerCase();

  const videoExtensions = [
    ".webm", ".mp4", ".mov", ".mkv",
    ".avi", ".ogv", ".m4v",
  ];

  if (
    mimeType.startsWith("video/") ||
    videoExtensions.some((ext) => filename.endsWith(ext))
  ) {
    return "video";
  }

  return "image";
}

app.get("/", (req, res) => {
  res.json({ message: "Camera backend is running" });
});

// Get media with search and type filters
app.get("/api/media", (req, res) => {
  try {
    let media = readMedia();

    const query = String(req.query.q || "").trim().toLowerCase();
    const type = String(req.query.type || "all").trim().toLowerCase();

    media = media.map((item) => {
      let url = item.url || "";

      if (url.startsWith("http://localhost:3001/")) {
        url = url.replace("http://localhost:3001", BACKEND_URL);
      } else if (url.startsWith("http://photo-app-27wa.onrender.com/")) {
        url = url.replace("http://photo-app-27wa.onrender.com", BACKEND_URL);
      } else if (url.startsWith("/uploads/")) {
        url = `${BACKEND_URL}${url}`;
      }

      return {
        ...item,
        url,
        type: getMediaType(item),
      };
    });

    if (query) {
      media = media.filter((item) => {
        const searchableText = [
          item.name,
          item.originalName,
          item.filename,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(query);
      });
    }

    if (type === "image" || type === "video") {
      media = media.filter((item) => item.type === type);
    }

    res.json(media);
  } catch (error) {
    console.error("Fetch media error:", error);
    res.status(500).json({ error: "Could not load media" });
  }
});

// Upload photo or video
app.post("/api/media", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const media = readMedia();
    const isVideo = getMediaType({
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
    }) === "video";

    const item = {
      id: randomUUID(),
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      type: isVideo ? "video" : "image",
      url: `${BACKEND_URL}/uploads/${req.file.filename}`,
      createdAt: new Date().toISOString(),
    };

    media.unshift(item);
    saveMedia(media);

    res.status(201).json(item);
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to save uploaded media" });
  }
});

// Secure restore endpoint for recovering existing local media
app.post(
  "/api/restore",
  (req, res, next) => {
    const secret = process.env.RESTORE_SECRET;

    if (!secret || req.get("x-restore-secret") !== secret) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    next();
  },
  upload.single("file"),
  (req, res) => {
    try {
      if (!req.file || !req.body.metadata) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({
          error: "File and metadata are required",
        });
      }

      let metadata;

      try {
        metadata = JSON.parse(req.body.metadata);
      } catch {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: "Invalid metadata JSON" });
      }

      if (!metadata.id) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: "Media ID is required" });
      }

      const media = readMedia();

      const item = {
        ...metadata,
        id: String(metadata.id),
        filename: req.file.filename,
        originalName: metadata.originalName || req.file.originalname,
        mimetype: metadata.mimetype || req.file.mimetype,
        type: getMediaType(metadata),
        url: `${BACKEND_URL}/uploads/${req.file.filename}`,
      };

      const existingIndex = media.findIndex(
        (entry) => entry.id === item.id
      );

      if (existingIndex >= 0) {
        const oldFilename = media[existingIndex].filename;

        media[existingIndex] = item;

        // Remove an old local file only if it is different.
        if (
          oldFilename &&
          oldFilename !== item.filename &&
          path.basename(oldFilename) !== item.filename
        ) {
          const oldPath = path.join(uploadsDir, path.basename(oldFilename));
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
      } else {
        media.unshift(item);
      }

      saveMedia(media);
      res.status(201).json({ message: "Media restored", item });
    } catch (error) {
      console.error("Restore error:", error);
      res.status(500).json({ error: "Failed to restore media" });
    }
  }
);

// Delete media
app.delete("/api/media/:id", (req, res) => {
  try {
    const media = readMedia();
    const item = media.find((entry) => entry.id === req.params.id);

    if (!item) {
      return res.status(404).json({ error: "Media not found" });
    }

    if (item.filename) {
      const filePath = path.join(uploadsDir, path.basename(item.filename));

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    const updatedMedia = media.filter(
      (entry) => entry.id !== req.params.id
    );

    saveMedia(updatedMedia);
    res.json({ message: "Media deleted successfully" });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ error: "Failed to delete media" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend running on port ${PORT}`);
});
