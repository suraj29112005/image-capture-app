import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { v2 as cloudinary } from "cloudinary";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const BACKEND_URL = "https://photo-app-27wa.onrender.com";

cloudinary.config(); 

const uploadsDir = path.join(__dirname, "uploads");
const mediaFile = path.join(__dirname, "media.json");
const tempDir = os.tmpdir();

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(mediaFile)) {
  fs.writeFileSync(mediaFile, "[]", "utf8");
}


app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-restore-secret']
}));

app.use(express.json());
app.use("/uploads", express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
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

function removeTempFile(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function getCloudinaryResourceType(item) {
  return getMediaType(item) === "video" ? "video" : "image";
}

async function uploadToCloudinary(filePath, item) {
  return cloudinary.uploader.upload(filePath, {
    resource_type: getCloudinaryResourceType(item),
    folder: "capture-suite",
  });
}

app.get("/", (req, res) => {
  res.json({ message: "Camera backend is running" });
});


app.get("/api/media", async (req, res) => {
  try {
    const localMedia = readMedia();
    const cloudinaryMedia = [];
    const seenPublicIds = new Set();

    for (const item of localMedia) {
      if (
        item.filename &&
        item.url &&
        item.url.includes("res.cloudinary.com")
      ) {
        seenPublicIds.add(item.filename);
      }
    }

    for (const resourceType of ["image", "video"]) {
      let nextCursor;

      do {
        const result = await cloudinary.api.resources({
          type: "upload",
          resource_type: resourceType,
          prefix: "capture-suite/",
          max_results: 100,
          ...(nextCursor ? { next_cursor: nextCursor } : {}),
        });

        for (const resource of result.resources || []) {
          if (seenPublicIds.has(resource.public_id)) {
            continue;
          }

          seenPublicIds.add(resource.public_id);

          const format = resource.format || "";
          const filename = resource.public_id.split("/").pop();

          cloudinaryMedia.push({
            id: `cloudinary_${Buffer.from(
              resource.public_id
            ).toString("base64url")}`,
            filename: resource.public_id,
            originalName: format
              ? `${filename}.${format}`
              : filename,
            mimetype: resourceType === "video"
              ? `video/${format || "mp4"}`
              : `image/${format || "jpeg"}`,
            type: resourceType,
            url: resource.secure_url,
            cloudinaryResourceType: resourceType,
            createdAt: resource.created_at,
          });
        }

        nextCursor = result.next_cursor;
      } while (nextCursor);
    }

    let media = [...localMedia, ...cloudinaryMedia];

    media = media.map((item) => {
      let url = item.url || "";

      if (url.startsWith("http://localhost:3001/")) {
        url = url.replace("http://localhost:3001", BACKEND_URL);
      } else if (
        url.startsWith("http://photo-app-27wa.onrender.com/")
      ) {
        url = url.replace(
          "http://photo-app-27wa.onrender.com",
          BACKEND_URL
        );
      } else if (url.startsWith("/uploads/")) {
        url = `${BACKEND_URL}${url}`;
      }

      return {
        ...item,
        url,
        type: item.type || getMediaType(item),
      };
    });

    const query = String(req.query.q || "").trim().toLowerCase();
    const type = String(req.query.type || "all").trim().toLowerCase();

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


app.post("/api/media", upload.single("file"), async (req, res) => {
  const tempFile = req.file?.path;

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const isVideo = getMediaType({
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
    }) === "video";

    const result = await uploadToCloudinary(tempFile, {
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
    });

    const media = readMedia();

    const item = {
      id: randomUUID(),
      filename: result.public_id,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      type: isVideo ? "video" : "image",
      url: result.secure_url,
      cloudinaryResourceType: result.resource_type,
      createdAt: new Date().toISOString(),
    };

    media.unshift(item);
    saveMedia(media);

    return res.status(201).json(item);
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    return res.status(500).json({ error: "Failed to upload media" });
  } finally {
    removeTempFile(tempFile);
  }
});

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
  async (req, res) => {
    const tempFile = req.file?.path;

    try {
      if (!req.file || !req.body.metadata) {
        return res.status(400).json({
          error: "File and metadata are required",
        });
      }

      let metadata;

      try {
        metadata = JSON.parse(req.body.metadata);
      } catch {
        return res.status(400).json({ error: "Invalid metadata JSON" });
      }

      if (!metadata.id) {
        return res.status(400).json({ error: "Media ID is required" });
      }

      const originalName =
        metadata.originalName || req.file.originalname;

      const mimetype =
        metadata.mimetype ||
        metadata.mimeType ||
        req.file.mimetype;

      const isVideo = getMediaType({
        ...metadata,
        originalName,
        mimetype,
      }) === "video";

      const result = await uploadToCloudinary(tempFile, {
        ...metadata,
        originalName,
        mimetype,
      });

      const media = readMedia();

      const item = {
        ...metadata,
        id: String(metadata.id),
        filename: result.public_id,
        originalName,
        mimetype,
        type: isVideo ? "video" : "image",
        url: result.secure_url,
        cloudinaryResourceType: result.resource_type,
      };

      const existingIndex = media.findIndex(
        (entry) => String(entry.id) === item.id
      );

      if (existingIndex >= 0) {
        media[existingIndex] = item;
      } else {
        media.unshift(item);
      }

      saveMedia(media);

      return res.status(201).json({
        message: "Media restored to Cloudinary",
        item,
      });
    } catch (error) {
      console.error("Restore error:", error);
      return res.status(500).json({ error: "Failed to restore media" });
    } finally {
      removeTempFile(tempFile);
    }
  }
);

app.delete("/api/media/:id", async (req, res) => {
  try {
    const media = readMedia();
    const requestedId = req.params.id;

    if (requestedId.startsWith("cloudinary_")) {
      const encodedId = requestedId.slice("cloudinary_".length);
      const publicId = Buffer.from(encodedId, "base64url").toString("utf8");

      if (!publicId.startsWith("capture-suite/")) {
        return res.status(400).json({
          error: "Invalid Cloudinary media ID",
        });
      }

      let resourceType = null;

      for (const candidate of ["image", "video"]) {
        try {
          await cloudinary.api.resource(publicId, {
            resource_type: candidate,
            type: "upload",
          });

          resourceType = candidate;
          break;
        } catch {
  
        }
      }

      if (!resourceType) {
        return res.status(404).json({
          error: "Cloudinary media not found",
        });
      }

      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
        type: "upload",
      });

      if (result.result !== "ok" && result.result !== "not found") {
        return res.status(502).json({
          error: "Cloudinary could not confirm deletion",
        });
      }

      return res.json({
        message: "Cloudinary media deleted successfully",
      });
    }

    const item = media.find(
      (entry) => String(entry.id) === requestedId
    );

    if (!item) {
      return res.status(404).json({ error: "Media not found" });
    }

    if (
      item.filename &&
      item.url &&
      item.url.includes("res.cloudinary.com")
    ) {
      const resourceType =
        item.cloudinaryResourceType || getCloudinaryResourceType(item);

      const result = await cloudinary.uploader.destroy(item.filename, {
        resource_type: resourceType,
        type: "upload",
      });

      if (result.result !== "ok" && result.result !== "not found") {
        return res.status(502).json({
          error: "Cloudinary could not confirm deletion",
        });
      }
    } else if (item.filename) {
      const filePath = path.join(
        uploadsDir,
        path.basename(item.filename)
      );

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    const updatedMedia = media.filter(
      (entry) => String(entry.id) !== requestedId
    );

    saveMedia(updatedMedia);

    return res.json({ message: "Media deleted successfully" });
  } catch (error) {
    console.error("Delete error:", error);
    return res.status(500).json({ error: "Failed to delete media" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend running on port ${PORT}`);
});