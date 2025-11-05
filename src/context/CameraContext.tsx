// src/context/CameraContext.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import mqtt from "mqtt";

const MQTT_URL = "ws://broker.hivemq.com:8000/mqtt";
const VIDEO_TOPIC = "crimebot/video";
const RAW_TOPIC = "camera/image_raw";
const INFO_TOPIC = "camera/camera_info";

type CameraMode = "idle" | "camera" | "viewer";

interface CameraContextType {
  videoRef: React.RefObject<HTMLVideoElement|null>;
  canvasRef: React.RefObject<HTMLCanvasElement|null>;
  stream: MediaStream | null;
  mode: CameraMode;
  isStreaming: boolean;
  startCamera: (opts?: { audio?: boolean }) => Promise<void>;
  stopCamera: () => void;
  startPublishingFrames: () => void;
  stopPublishingFrames: () => void;
}

const CameraContext = createContext<CameraContextType | null>(null);

export const CameraProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isStreaming, setIsStreaming] = useState(false);
  const [mode, setMode] = useState<CameraMode>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);

  const clientRef = useRef<mqtt.MqttClient | null>(null);
  const loopRef = useRef<number | null>(null);

  // ✅ MQTT connect
  useEffect(() => {
    const client = mqtt.connect(MQTT_URL);
    clientRef.current = client;

    client.on("connect", () => console.log("[MQTT] connected"));

    return () => {
      if (loopRef.current) cancelAnimationFrame(loopRef.current);
      client.end(true);
    };
  }, []);

  // ✅ Start camera
  const startCamera = async (opts?: { audio?: boolean }) => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: opts?.audio || false,
      });
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play();
      }
      setIsStreaming(true);
      setMode("camera");
    } catch (err) {
      console.error("Camera error:", err);
    }
  };

  // ✅ Stop camera
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    if (loopRef.current) cancelAnimationFrame(loopRef.current);
    setIsStreaming(false);
    setMode("idle");
  };

  // ✅ Publish frames loop
  const startPublishingFrames = () => {
    const loop = () => {
      if (!canvasRef.current || !videoRef.current || !clientRef.current) {
        loopRef.current = requestAnimationFrame(loop);
        return;
      }
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;

      const w = videoRef.current.videoWidth;
      const h = videoRef.current.videoHeight;
      if (w === 0 || h === 0) {
        loopRef.current = requestAnimationFrame(loop);
        return;
      }

      canvasRef.current.width = w;
      canvasRef.current.height = h;
      ctx.drawImage(videoRef.current, 0, 0, w, h);

      canvasRef.current.toBlob(
        (blob) => {
          if (!blob || !clientRef.current) return;

          const reader = new FileReader();
          reader.onloadend = () => {
            if (!reader.result || !clientRef.current) return;
            const uint8Array = new Uint8Array(reader.result as ArrayBuffer);
            const base64String = btoa(
              String.fromCharCode(...uint8Array)
            );

            const stamp = Date.now();
            const frame_id = "camera_link";

            // 1. UI preview
            clientRef.current!.publish(VIDEO_TOPIC, base64String);

            // 2. Raw RGB frame
            clientRef.current!.publish(RAW_TOPIC, base64String);

            // 3. Camera info
            const fx = 600,
              fy = 600,
              cx = w / 2,
              cy = h / 2;
            const info = {
              header: { stamp, frame_id },
              height: h,
              width: w,
              distortion_model: "plumb_bob",
              D: [0, 0, 0, 0, 0],
              K: [fx, 0, cx, 0, fy, cy, 0, 0, 1],
              R: [1, 0, 0, 0, 1, 0, 0, 0, 1],
              P: [fx, 0, cx, 0, 0, fy, cy, 0, 0, 0, 1, 0],
            };
            clientRef.current!.publish(INFO_TOPIC, JSON.stringify(info));
          };
          reader.readAsArrayBuffer(blob);
        },
        "image/jpeg",
        0.5
      );

      loopRef.current = requestAnimationFrame(loop);
    };
    loop();
  };

  const stopPublishingFrames = () => {
    if (loopRef.current) {
      cancelAnimationFrame(loopRef.current);
      loopRef.current = null;
    }
  };

  return (
    <CameraContext.Provider
      value={{
        videoRef,
        canvasRef,
        stream,
        mode,
        isStreaming,
        startCamera,
        stopCamera,
        startPublishingFrames,
        stopPublishingFrames,
      }}
    >
      {children}
    </CameraContext.Provider>
  );
};

export const useCamera = () => {
  const ctx = useContext(CameraContext);
  if (!ctx) throw new Error("useCamera must be used inside CameraProvider");
  return ctx;
};
