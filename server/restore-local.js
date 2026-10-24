import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(here, "uploads");
const mediaFile = path.join(here, "media.json");
const API = "https://photo-app-27wa.onrender.com/api/restore";
const secret = process.env.RESTORE_SECRET;

if (!secret) {
  console.error("RESTORE_SECRET environment variable set nahi hai.");
  process.exit(1);
}

const media = JSON.parse(fs.readFileSync(mediaFile, "utf8"));
let success = 0;
let failed = 0;

for (const item of media) {

  if (item.url && item.url.includes("res.cloudinary.com")) {
    console.log("ALREADY ON CLOUDINARY (SKIPPED):", item.filename || item.id);
    continue;
  }

  const filename = path.basename(item.filename || "");
  const filePath = path.join(uploadsDir, filename);

  if (!filename || !fs.existsSync(filePath)) {
    console.log("FILE MISSING:", filename || item.id);
    failed++;
    continue;
  }

  try {
    const buffer = fs.readFileSync(filePath);
    const form = new FormData();

    form.append(
      "file",
      new Blob([buffer], {
        type: item.mimetype || item.mimeType || "application/octet-stream"
      }),
      filename
    );
    form.append("metadata", JSON.stringify(item));

    const response = await fetch(API, {
      method: "POST",
      headers: { "x-restore-secret": secret },
      body: form
    });

    const result = await response.text();

    if (!response.ok) {
      console.log("FAILED:", filename, response.status, result);
      failed++;
      continue;
    }

    console.log("RESTORED:", filename);
    success++;
  } catch (error) {
    console.log("ERROR:", filename, error.message);
    failed++;
  }
}

console.log(`\nFinished. Success: ${success}, Failed: ${failed}`);