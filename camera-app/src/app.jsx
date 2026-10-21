import { useEffect, useRef, useState } from "react";
import "./style.css";

const API_URL = "https://photo-app-27wa.onrender.com/api/media";
export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const [cameraReady, setCameraReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // Advanced States & Features
  const [zoom, setZoom] = useState(1);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [filterEffect, setFilterEffect] = useState("none");
  const [lastCapturedImage, setLastCapturedImage] = useState(null);
  const [facingMode, setFacingMode] = useState("user");
  const [showGrid, setShowGrid] = useState(false);
  const [timerSetting, setTimerSetting] = useState("0"); // "0" means off, "3" means 3 seconds
  const [countdown, setCountdown] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function initializeCamera() {
      try {
        setMessage("");
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
        }

        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode },
            audio: true,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
          });
          if (mounted) {
            setMessage("Camera started without microphone.");
          }
        }

        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        if (mounted) {
          setCameraReady(true);
        }
      } catch (error) {
        console.error("Camera error:", error);
        if (mounted) {
          setMessage(
            "Camera access failed. Allow camera and microphone permissions."
          );
        }
      }
    }

    initializeCamera();

    return () => {
      mounted = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [facingMode]);

  async function uploadMedia(blob, type, filename) {
    const formData = new FormData();
    const mimeType = type === "video" ? "video/webm" : "image/jpeg";
    const correctedBlob = new Blob([blob], { type: mimeType });

    formData.append("file", correctedBlob, filename);
    formData.append("type", type);

    const response = await fetch(API_URL, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Upload failed (${response.status})`);
    }

    return response.json();
  }

  // Handle Photo Capture (Checks if timer is enabled or instant)
  function handleCaptureClick() {
    if (!videoRef.current || !canvasRef.current || busy || countdown !== null) return;

    const seconds = parseInt(timerSetting);
    if (seconds > 0) {
      setCountdown(seconds);
      let timeLeft = seconds;

      const timerInterval = setInterval(() => {
        timeLeft -= 1;
        if (timeLeft > 0) {
          setCountdown(timeLeft);
        } else {
          clearInterval(timerInterval);
          setCountdown(null);
          executeTakePhoto();
        }
      }, 1000);
    } else {
      executeTakePhoto(); // Instant click if timer is OFF ("0")
    }
  }

  async function executeTakePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video.videoWidth || !video.videoHeight) {
      setMessage("Camera is not ready yet.");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      setMessage("Could not capture photo.");
      return;
    }

    let filterString = `brightness(${brightness}%) contrast(${contrast}%)`;
    if (filterEffect === "grayscale") filterString += " grayscale(100%)";
    if (filterEffect === "sepia") filterString += " sepia(100%)";
    if (filterEffect === "invert") filterString += " invert(100%)";
    
    context.filter = filterString;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          setMessage("Could not capture photo.");
          return;
        }

        const imageUrl = URL.createObjectURL(blob);
        setLastCapturedImage(imageUrl);

        try {
          setBusy(true);
          setMessage("Saving photo...");
          await uploadMedia(blob, "image", `photo-${Date.now()}.jpg`);
          setMessage("Photo saved! Tap thumbnail or open gallery.");
        } catch (error) {
          console.error("Photo upload error:", error);
          setMessage(error.message);
        } finally {
          setBusy(false);
        }
      },
      "image/jpeg",
      0.92
    );
  }

  function startRecording() {
    if (!streamRef.current || recording || busy) return;

    try {
      chunksRef.current = [];
      const supportedTypes = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ];
      const mimeType = supportedTypes.find((type) =>
        MediaRecorder.isTypeSupported(type)
      );

      const recorder = mimeType
        ? new MediaRecorder(streamRef.current, { mimeType })
        : new MediaRecorder(streamRef.current);

      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error("Recording error:", event.error);
        setMessage("Video recording failed.");
        setRecording(false);
      };

      recorder.onstop = async () => {
        const actualMimeType = recorder.mimeType || "video/webm";
        const blob = new Blob(chunksRef.current, { type: actualMimeType });
        chunksRef.current = [];

        if (blob.size === 0) {
          setMessage("Video is empty. Please record again.");
          setRecording(false);
          return;
        }

        const extension = actualMimeType.includes("mp4") ? "mp4" : "webm";

        try {
          setBusy(true);
          setMessage("Saving video...");
          await uploadMedia(blob, "video", `video-${Date.now()}.${extension}`);
          setMessage("Video saved! Open Gallery to view it.");
        } catch (error) {
          console.error("Video upload error:", error);
          setMessage(error.message);
        } finally {
          setBusy(false);
          setRecording(false);
        }
      };

      recorder.start();
      setRecording(true);
      setMessage("Recording video...");
    } catch (error) {
      console.error("Could not start recording:", error);
      setMessage("Could not start video recording.");
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      setMessage("Finishing video...");
    }
  }

  function toggleCamera() {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  }

  function openGallery() {
    window.location.assign(GALLERY_URL);
  }

  const getVideoFilterStyle = () => {
    let f = `brightness(${brightness}%) contrast(${contrast}%)`;
    if (filterEffect === "grayscale") f += " grayscale(100%)";
    if (filterEffect === "sepia") f += " sepia(100%)";
    if (filterEffect === "invert") f += " invert(100%)";
    return f;
  };

  return (
    <div className="app">
      <h1>Camera App</h1>

      <main className="camera-container">
        <header className="camera-header">
          <button
            type="button"
            className="flip-btn"
            onClick={toggleCamera}
            style={{ minHeight: "36px", padding: "6px 14px", fontSize: "13px" }}
          >
            🔄 Flip Camera
          </button>
          
          <button
            type="button"
            className="gallery-btn"
            onClick={openGallery}
            style={{ minHeight: "36px", padding: "6px 14px", fontSize: "13px" }}
          >
            Open Gallery &rarr;
          </button>
        </header>

        {/* Camera Preview */}
        <div className="camera-view">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              transform: `scale(${zoom})`,
              filter: getVideoFilterStyle(),
            }}
          />

          {/* Grid Lines Overlay */}
          {showGrid && (
            <div className="grid-overlay">
              <div className="grid-line"></div>
              <div className="grid-line"></div>
              <div className="grid-line"></div>
              <div className="grid-line"></div>
              <div className="grid-line"></div>
              <div className="grid-line"></div>
              <div className="grid-line"></div>
              <div className="grid-line"></div>
              <div className="grid-line"></div>
            </div>
          )}

          {/* Countdown Timer Overlay */}
          {countdown !== null && (
            <div className="countdown-overlay">
              {countdown}
            </div>
          )}

          {!cameraReady && (
            <div
              className="status"
              style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(3,7,18,0.8)", zIndex: 5 }}
            >
              Starting camera...
            </div>
          )}
        </div>

        <canvas ref={canvasRef} hidden />

        {/* Horizontal Advanced Controls Bar (Zoom, Brightness, Contrast, Filter, Grid, Timer) */}
        <div className="horizontal-controls-bar">
          <div className="control-pill">
            <label>Zoom: {zoom}x</label>
            <input
              type="range"
              min="1"
              max="3"
              step="0.1"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
            />
          </div>

          <div className="control-pill">
            <label>Brightness: {brightness}%</label>
            <input
              type="range"
              min="50"
              max="150"
              value={brightness}
              onChange={(e) => setBrightness(parseInt(e.target.value))}
            />
          </div>

          <div className="control-pill">
            <label>Contrast: {contrast}%</label>
            <input
              type="range"
              min="50"
              max="150"
              value={contrast}
              onChange={(e) => setContrast(parseInt(e.target.value))}
            />
          </div>

          <div className="control-pill">
            <label>Filter:</label>
            <select
              value={filterEffect}
              onChange={(e) => setFilterEffect(e.target.value)}
            >
              <option value="none">Normal</option>
              <option value="grayscale">Grayscale</option>
              <option value="sepia">Sepia</option>
              <option value="invert">Invert</option>
            </select>
          </div>

          <div className="control-pill">
            <label>Timer:</label>
            <select
              value={timerSetting}
              onChange={(e) => setTimerSetting(e.target.value)}
            >
              <option value="0">Off (Instant)</option>
              <option value="3">3 Seconds</option>
              <option value="5">5 Seconds</option>
            </select>
          </div>

          <div className="control-pill" style={{ gap: "10px" }}>
            <label htmlFor="gridToggle" style={{ cursor: "pointer" }}>Grid Lines</label>
            <input
              id="gridToggle"
              type="checkbox"
              checked={showGrid}
              onChange={(e) => setShowGrid(e.target.checked)}
            />
          </div>
        </div>

        {/* Bottom Action Bar: Thumbnail Preview, Round Shutter, Recording Button */}
        <div className="bottom-action-bar">
          <div
            className="thumbnail-preview"
            onClick={openGallery}
            title="View in Gallery"
          >
            {lastCapturedImage ? (
              <img src={lastCapturedImage} alt="Last captured" />
            ) : (
              <span className="thumbnail-placeholder">Gallery</span>
            )}
          </div>

          <button
            type="button"
            className="shutter-btn"
            onClick={handleCaptureClick}
            disabled={!cameraReady || busy || recording || countdown !== null}
            aria-label="Take Photo"
          ></button>

          {!recording ? (
            <button
              type="button"
              className="record-btn"
              onClick={startRecording}
              disabled={!cameraReady || busy || countdown !== null}
            >
              Record
            </button>
          ) : (
            <button
              type="button"
              className="record-btn"
              onClick={stopRecording}
              disabled={busy}
              style={{ background: "#475569" }}
            >
              Stop
            </button>
          )}
        </div>

        {message && (
          <p className="status" role="status">
            {message}
          </p>
        )}
      </main>
    </div>
  );
}