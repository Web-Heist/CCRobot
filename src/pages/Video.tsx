// src/pages/Video.tsx
import React, { useEffect, useRef, useState } from "react";
import { useCamera } from "../context/CameraContext";

// WebSocket-based streaming handled in CameraContext now

type TabKey =
  | "dashboard"
  | "robot"
  | "controls"
  | "video"
  | "gps"
  | "connectivity"
  | "modes";

type Props = {
  setTab: React.Dispatch<React.SetStateAction<TabKey>>;
};

export default function Video({ setTab }: Props) {
  const camera = useCamera();

  // Use camera context's refs so frame capture works
  const videoRef = camera.videoRef;
  const canvasRef = camera.canvasRef;
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [modeLocal, setModeLocal] = useState<"idle" | "camera" | "viewer">("idle");
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [audioOn, setAudioOn] = useState(false);

  // Video element is fully managed by CameraContext (stream attachment, play, etc.)
  // No need to duplicate stream attachment here

  // React to provider mode
  useEffect(() => {
    setModeLocal(
      camera.mode === "camera" ? "camera" : camera.mode === "viewer" ? "viewer" : "idle"
    );
  }, [camera.mode]);

  // Start camera
  const startCamera = async () => {
    try {
      await camera.startCamera({ audio: micOn });
      setModeLocal("camera");
      // Wait a bit for video element to be ready before starting frame capture
      setTimeout(() => {
        camera.startPublishingFrames();
      }, 500);
    } catch (err) {
      console.error("startCamera failed:", err);
    }
  };

  // Stop camera
  const stopCamera = () => {
    camera.stopPublishingFrames();
    camera.stopCamera();
    setModeLocal("idle");
  };

  // Viewer mode via WebSocket managed by CameraContext; keep <img> src updated
  useEffect(() => {
    if (modeLocal === "viewer") {
      camera.startViewer();
    }
    return () => {
      if (modeLocal === "viewer") {
        camera.stopViewer();
      }
    };
  }, [modeLocal]);

  // Snapshot
  const takeSnapshot = () => {
    const video = videoRef.current;
    const img = imgRef.current;
    const canvas = canvasRef.current ?? document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (modeLocal === "camera" && video) {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } else if (modeLocal === "viewer" && img) {
      canvas.width = img.naturalWidth || 640;
      canvas.height = img.naturalHeight || 480;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }

    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = "snapshot.png";
    link.click();
  };

  // Recording
  const toggleRecording = () => {
    if (recording) {
      mediaRecorder?.stop();
      setRecording(false);
      setMediaRecorder(null);
      return;
    }

    const s = camera.stream;
    if (!s) {
      console.warn("No stream to record");
      return;
    }

    try {
      const recorder = new MediaRecorder(s);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "recording.webm";
        link.click();
        URL.revokeObjectURL(url);
      };
      recorder.start();
      setMediaRecorder(recorder);
      setRecording(true);
    } catch (err) {
      console.error("MediaRecorder start failed:", err);
    }
  };

  return (
    <div className="flex flex-col items-center w-full p-4">
      <div
        className={`w-full transition-all duration-300 ${
          modeLocal === "idle" ? "max-w-md h-[30vh]" : "max-w-4xl h-[70vh]"
        }`}
      >
        {modeLocal === "viewer" ? (
          <img
            ref={imgRef}
            alt="Incoming Stream"
            className="w-full h-full object-contain rounded-lg shadow-md bg-black"
            src={camera.lastFrameUrl || undefined}
          />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={!audioOn}
            className="w-full h-full object-contain rounded-lg shadow-md bg-black"
          />
        )}
      </div>

      <canvas ref={canvasRef} style={{ display: "none" }} width={640} height={480} />

      <div className="flex flex-wrap gap-3 mt-4">
        {modeLocal === "camera" ? (
          <button
            onClick={stopCamera}
            className="px-4 py-2 bg-red-700 text-white rounded-lg"
          >
            Stop Camera
          </button>
        ) : (
          <button
            onClick={startCamera}
            className="px-4 py-2 bg-gradient-to-r from-blue-900 via-cyan-700 to-blue-900 text-white rounded-lg"
          >
            Start Camera
          </button>
        )}

        {modeLocal === "viewer" ? (
          <button
            onClick={() => {
              setModeLocal("idle");
              camera.stopViewer();
            }}
            className="px-4 py-2 bg-red-700 text-white rounded-lg"
          >
            Stop Viewing
          </button>
        ) : (
          <button
            onClick={() => setModeLocal("viewer")}
            className="px-4 py-2 bg-gradient-to-r from-blue-900 via-cyan-700 to-blue-900 text-white rounded-lg"
          >
            View Stream
          </button>
        )}

        <button
          onClick={takeSnapshot}
          className="px-4 py-2 bg-gradient-to-r from-blue-900 via-cyan-700 to-blue-900 text-white rounded-lg"
        >
          Snapshot
        </button>

        <button
          onClick={toggleRecording}
          className={`px-4 py-2 rounded-lg ${
            recording
              ? "bg-red-700"
              : "bg-gradient-to-r from-blue-900 via-cyan-700 to-blue-900"
          } text-white`}
        >
          {recording ? "Stop Recording" : "Start Recording"}
        </button>

        <button
          onClick={() => setMicOn((p) => !p)}
          className={`px-4 py-2 rounded-lg ${
            micOn
              ? "bg-red-500"
              : "bg-gradient-to-r from-blue-900 via-cyan-700 to-blue-900"
          } text-white`}
        >
          {micOn ? "Mic On" : "Mic Off"}
        </button>

        <button
          onClick={() => setAudioOn((p) => !p)}
          className={`px-4 py-2 rounded-lg ${
            audioOn
              ? "bg-red-500"
              : "bg-gradient-to-r from-blue-900 via-cyan-700 to-blue-900"
          } text-white`}
        >
          {audioOn ? "Audio On" : "Audio Off"}
        </button>
      </div>
    </div>
  );
}