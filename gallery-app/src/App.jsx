import { useEffect, useRef, useState } from "react";
import "./style.css";

const API_URL = "https://photo-app-27wa.onrender.com/api/media";
const GALLERY_URL = "https://gallery-frontend-yd9j.onrender.com";

const API = import.meta.env.DEV
  ? "http://localhost:3001"
  : "https://photo-app-27wa.onrender.com";

export default function App() {
  const [media, setMedia] = useState([]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all"); // "all", "image", "video"
  const [message, setMessage] = useState("");

  async function loadMedia() {
    try {
      const params = new URLSearchParams();

      if (query.trim()) {
        params.set("q", query.trim());
      }

      // Agar server-side filtering support nahi hai toh hum frontend par filter karenge
      const response = await fetch(
        `${API}/api/media?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error("Could not load media");
      }

      const data = await response.json();
      setMedia(data);
      setMessage("");
    } catch (error) {
      setMessage(
        error.message + ". Server start hai check karo."
      );
    }
  }

  function getMediaUrl(url) {
    if (!url) return "";
    return url.startsWith("http") ? url : `${API}${url}`;
  }

  useEffect(() => {
    loadMedia();
  }, [query]);

  // Frontend filtering based on selected folder tab
  const filteredMedia = media.filter(item => {
    if (type === "image") return item.type === "image";
    if (type === "video") return item.type === "video";
    return true; // "all"
  });

  async function deleteMedia(id) {
    const confirmed = window.confirm(
      "Kya tum is media ko permanently delete karna chahte ho?"
    );

    if (!confirmed) return;

    try {
      const response = await fetch(
        `${API}/api/media/${id}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        throw new Error("Delete failed");
      }

      loadMedia();
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <main className="gallery-page">
      <header>
        <div>
          <h1>My Gallery</h1>
          <p>Your photos and videos in one place.</p>
        </div>

        <a href="http://localhost:5174/">
          Open Camera →
        </a>
      </header>

      {/* Folder / Category Tabs */}
      <section className="folder-tabs-bar" style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setType("all")}
          style={{
            padding: "10px 20px",
            borderRadius: "14px",
            border: "1px solid rgba(255,255,255,0.1)",
            background: type === "all" ? "linear-gradient(135deg, #4f46e5, #7c3aed)" : "rgba(15, 23, 42, 0.65)",
            color: "#fff",
            fontWeight: "600",
            cursor: "pointer",
            boxShadow: type === "all" ? "0 4px 15px rgba(99, 102, 241, 0.4)" : "none"
          }}
        >
          📁 All Media ({media.length})
        </button>

        <button
          type="button"
          onClick={() => setType("image")}
          style={{
            padding: "10px 20px",
            borderRadius: "14px",
            border: "1px solid rgba(255,255,255,0.1)",
            background: type === "image" ? "linear-gradient(135deg, #0ea5e9, #2563eb)" : "rgba(15, 23, 42, 0.65)",
            color: "#fff",
            fontWeight: "600",
            cursor: "pointer",
            boxShadow: type === "image" ? "0 4px 15px rgba(14, 165, 233, 0.4)" : "none"
          }}
        >
          🖼️ Photos Folder ({media.filter(i => i.type === "image").length})
        </button>

        <button
          type="button"
          onClick={() => setType("video")}
          style={{
            padding: "10px 20px",
            borderRadius: "14px",
            border: "1px solid rgba(255,255,255,0.1)",
            background: type === "video" ? "linear-gradient(135deg, #f43f5e, #e11d48)" : "rgba(15, 23, 42, 0.65)",
            color: "#fff",
            fontWeight: "600",
            cursor: "pointer",
            boxShadow: type === "video" ? "0 4px 15px rgba(244, 63, 94, 0.4)" : "none"
          }}
        >
          🎥 Videos Folder ({media.filter(i => i.type === "video").length})
        </button>
      </section>

      <section className="gallery-toolbar">
        <input
          type="search"
          placeholder="Search media..."
          value={query}
          onChange={event => setQuery(event.target.value)}
        />

        <button onClick={loadMedia}>Refresh</button>
      </section>

      {message && <p className="message">{message}</p>}

      {filteredMedia.length === 0 ? (
        <section className="empty">
          <h2>No media found</h2>
          <p>Is folder me koi media nahi hai.</p>
        </section>
      ) : (
        <section className="media-grid">
          {filteredMedia.map(item => (
            <article className="media-card" key={item.id}>
              {item.type === "video" ? (
                <video
                  src={getMediaUrl(item.url)}
                  controls
                />
              ) : (
                <img
                  src={getMediaUrl(item.url)}
                  alt={item.name || item.originalName || "Photo"}
                />
              )}

              <div className="media-details">
                <h3>
                  {item.name ||
                    item.originalName ||
                    item.filename ||
                    "Untitled media"}
                </h3>

                <p>
                  {new Date(item.createdAt).toLocaleString()}
                </p>

                <div className="media-actions">
                  <a
                    href={getMediaUrl(item.url)}
                    download={item.originalName || item.filename}
                  >
                    Download
                  </a>

                  <button
                    onClick={() => deleteMedia(item.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}