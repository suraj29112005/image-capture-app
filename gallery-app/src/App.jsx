import { useEffect, useState } from "react";
import "./style.css";

const API = import.meta.env.DEV
  ? "http://localhost:3001"
  : "https://photo-app-27wa.onrender.com";

export default function App() {
  const [media, setMedia] = useState([]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [message, setMessage] = useState("");
  
  // Lightbox, Zoom, & Transition State
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [isExiting, setIsExiting] = useState(false);

  async function loadMedia() {
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());

      const response = await fetch(`${API}/api/media?${params.toString()}`);
      if (!response.ok) throw new Error("Could not load media");

      const data = await response.json();
      setMedia(data);
      setMessage("");
    } catch (error) {
      setMessage(error.message + ". Server start hai check karo.");
    }
  }

  function getMediaUrl(url) {
    if (!url) return "";
    return url.startsWith("http") ? url : `${API}${url}`;
  }

  useEffect(() => {
    loadMedia();
  }, [query]);

  const filteredMedia = media.filter(item => {
    if (type === "image") return item.type === "image";
    if (type === "video") return item.type === "video";
    return true; 
  });

  async function deleteMedia(id) {
    const confirmed = window.confirm(
      "Kya tum is media ko permanently delete karna chahte ho?"
    );
    if (!confirmed) return;

    try {
      const response = await fetch(`${API}/api/media/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");
      loadMedia(); 
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleDownload(item) {
    try {
      const url = getMediaUrl(item.url);
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = item.originalName || item.filename || "download";
      document.body.appendChild(link);
      link.click();
      
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Download error:", error);
      setMessage("Download failed. CORS or network error.");
    }
  }

  function openModal(item) {
    setSelectedMedia(item);
    setZoom(1);
  }

  function closeModal() {
    setSelectedMedia(null);
    setZoom(1);
  }

  // Camera transition function
  function goToCamera() {
    setIsExiting(true);
    setTimeout(() => {
      window.location.href = "https://camera-frontend-70e6.onrender.com";
    }, 500); // 500ms matches the CSS transition time
  }

  return (
    <main className={`gallery-page ${isExiting ? "page-exit" : "page-enter"}`}>
      <header className="app-header">
        <div>
          <h1>My Gallery</h1>
          <p>Your photos and videos in one place.</p>
        </div>
        
        {/* Camera Transition Button */}
        <button onClick={goToCamera} className="camera-btn">
          📸 Open Camera
        </button>
      </header>

      <section className="folder-tabs-bar">
        <button
          type="button"
          onClick={() => setType("all")}
          className={`folder-btn ${type === "all" ? "active-all" : ""}`}
        >
          📁 All Media ({media.length})
        </button>
        <button
          type="button"
          onClick={() => setType("image")}
          className={`folder-btn ${type === "image" ? "active-image" : ""}`}
        >
          🖼️ Photos ({media.filter(i => i.type === "image").length})
        </button>
        <button
          type="button"
          onClick={() => setType("video")}
          className={`folder-btn ${type === "video" ? "active-video" : ""}`}
        >
          🎥 Videos ({media.filter(i => i.type === "video").length})
        </button>
      </section>

      <section className="gallery-toolbar">
        <input
          type="search"
          placeholder="Search media..."
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
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
                  className="media-thumbnail"
                  onClick={() => openModal(item)}
                />
              ) : (
                <img
                  src={getMediaUrl(item.url)}
                  alt={item.name || item.originalName || "Photo"}
                  className="media-thumbnail"
                  onClick={() => openModal(item)}
                />
              )}

              <div className="media-details">
                <h3>{item.name || item.originalName || item.filename || "Untitled media"}</h3>
                <p>{new Date(item.createdAt).toLocaleString()}</p>
                <div className="media-actions">
                  <button onClick={() => handleDownload(item)}>Download</button>
                  <button onClick={() => deleteMedia(item.id)} className="delete-btn">Delete</button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {selectedMedia && (
        <div className="modal-overlay">
          <div className="modal-controls">
            {selectedMedia.type === "image" && (
              <>
                <button onClick={() => setZoom(prev => prev + 0.5)} className="modal-btn">➕ Zoom In</button>
                <button onClick={() => setZoom(prev => Math.max(0.5, prev - 0.5))} className="modal-btn">➖ Zoom Out</button>
              </>
            )}
            <button onClick={closeModal} className="modal-btn close-btn">❌ Close</button>
          </div>

          <div className="modal-content">
            {selectedMedia.type === "video" ? (
              <video
                src={getMediaUrl(selectedMedia.url)}
                controls
                autoPlay
                className="modal-video"
              />
            ) : (
              <img
                src={getMediaUrl(selectedMedia.url)}
                alt="Zoomed media"
                className="modal-image"
                style={{ transform: `scale(${zoom})` }}
              />
            )}
          </div>
        </div>
      )}
    </main>
  );
}