
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
const PORT = 3001;

const uploadsDir = path.join(__dirname, "uploads");
const mediaFile = path.join(__dirname, "media.json");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(mediaFile)) {
  fs.writeFileSync(mediaFile, "[]", "utf8");
}

app.use(
  cors({
    origin: [
      "http://localhost:5174",
      "http://localhost:5175",
    ],
  })
);

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

const upload = multer({ storage });

function readMedia() {
  try {
    return JSON.parse(
      fs.readFileSync(mediaFile, "utf8") || "[]"
    );
  } catch (error) {
    console.error("Error reading media.json:", error);
    return [];
  }
}

function saveMedia(media) {
  fs.writeFileSync(
    mediaFile,
    JSON.stringify(media, null, 2),
    "utf8"
  );
}

// Correct media type, including older entries with .webm filenames
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
    ".webm",
    ".mp4",
    ".mov",
    ".mkv",
    ".avi",
    ".ogv",
    ".m4v",
  ];

  if (
    mimeType.startsWith("video/") ||
    videoExtensions.some((ext) => filename.endsWith(ext))
  ) {
    return "video";
  }

  return "image";
}

// Test route
app.get("/", (req, res) => {
  res.json({ message: "Camera backend is running" });
});

// Get media, apply search and type filters
app.get("/api/media", (req, res) => {
  try {
    let media = readMedia();

    const query = String(req.query.q || "")
      .trim()
      .toLowerCase();

    const type = String(req.query.type || "all")
      .trim()
      .toLowerCase();

    // Normalize existing entries without deleting any media
    media = media.map((item) => ({
      ...item,
      type: getMediaType(item),
    }));

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
      return res.status(400).json({
        error: "No file uploaded",
      });
    }

    const media = readMedia();
    const extension = path.extname(req.file.originalname).toLowerCase();

    const videoExtensions = [
      ".webm",
      ".mp4",
      ".mov",
      ".mkv",
      ".avi",
      ".ogv",
      ".m4v",
    ];

    const isVideo =
      req.file.mimetype.toLowerCase().startsWith("video/") ||
      videoExtensions.includes(extension);

    const item = {
      id: randomUUID(),
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      type: isVideo ? "video" : "image",
      url: `http://localhost:${PORT}/uploads/${req.file.filename}`,
      createdAt: new Date().toISOString(),
    };

    media.unshift(item);
    saveMedia(media);

    res.status(201).json(item);
  } catch (error) {
    console.error("Upload error:", error);

    res.status(500).json({
      error: "Failed to save uploaded media",
    });
  }
});

// Delete media
app.delete("/api/media/:id", (req, res) => {
  try {
    const media = readMedia();

    const item = media.find(
      (entry) => entry.id === req.params.id
    );

    if (!item) {
      return res.status(404).json({
        error: "Media not found",
      });
    }

    if (item.filename) {
      const filePath = path.join(
        uploadsDir,
        path.basename(item.filename)
      );

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    const updatedMedia = media.filter(
      (entry) => entry.id !== req.params.id
    );

    saveMedia(updatedMedia);

    res.json({
      message: "Media deleted successfully",
    });
  } catch (error) {
    console.error("Delete error:", error);

    res.status(500).json({
      error: "Failed to delete media",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
