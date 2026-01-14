// src/context/CameraContext.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { io, Socket } from "socket.io-client";
import { useMqtt } from "./MqttContext";

type CameraMode = "idle" | "camera" | "viewer";

interface CameraContextType {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  stream: MediaStream | null;
  mode: CameraMode;
  isStreaming: boolean;
  startCamera: (opts?: { audio?: boolean }) => Promise<void>;
  stopCamera: () => void;
  startPublishingFrames: () => void;
  stopPublishingFrames: () => void;
  startViewer: () => void;
  stopViewer: () => void;
  lastFrameUrl: string | null;
  fps: number; // Added for monitoring
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
  const [fps, setFps] = useState(0);

  const { publish, isConnected } = useMqtt();

  const loopRef = useRef<number | null>(null);
  const lastSentRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const publisherSocketRef = useRef<Socket | null>(null);
  const viewerSocketRef = useRef<Socket | null>(null);
  const [lastFrameUrl, setLastFrameUrl] = useState<string | null>(null);
  const loopStartedRef = useRef<boolean>(false);
  
  // FPS tracking
  const fpsWindowRef = useRef<number[]>([]);
  const lastFpsLogRef = useRef<number>(Date.now());
  
  // ✅ ADD: Watchdog to detect stuck loops
  const watchdogIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastFrameTimeRef = useRef<number>(Date.now());

  // 🧹 Cleanup on unmount
  useEffect(() => {
    return () => {
      if (loopRef.current) cancelAnimationFrame(loopRef.current);
      if (lastFrameUrl) URL.revokeObjectURL(lastFrameUrl);
      if (publisherSocketRef.current) publisherSocketRef.current.disconnect();
      if (viewerSocketRef.current) viewerSocketRef.current.disconnect();
      if (watchdogIntervalRef.current) clearInterval(watchdogIntervalRef.current);
    };
  }, [lastFrameUrl]);
  
  
  // 🎥 Start camera
  const startCamera = async (opts?: { audio?: boolean }) => {
    try {
      const streamObj = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user"
        },
        audio: opts?.audio || false,
      });
      
      setStream(streamObj);
      
      if (videoRef.current) {
        videoRef.current.srcObject = streamObj;
        await videoRef.current.play();

        // Wait for video metadata
        await new Promise<void>((resolve) => {
          const checkReady = () => {
            if (
              videoRef.current &&
              videoRef.current.videoWidth > 0 &&
              videoRef.current.videoHeight > 0
            ) {
              console.log(
                `✅ Camera ready: ${videoRef.current.videoWidth}x${videoRef.current.videoHeight}`
              );
              resolve();
            } else {
              setTimeout(checkReady, 100);
            }
          };
          checkReady();
        });
      }

      setIsStreaming(true);
      setMode("camera");
      console.log("✅ Camera started successfully");
    } catch (err) {
      console.error("❌ Camera error:", err);
      throw err;
    }
  };

  // 🛑 Stop camera
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    if (loopRef.current) {
      cancelAnimationFrame(loopRef.current);
      loopRef.current = null;
    }
    if (publisherSocketRef.current) {
      publisherSocketRef.current.disconnect();
      publisherSocketRef.current = null;
    }
    loopStartedRef.current = false;
    frameCountRef.current = 0;
    fpsWindowRef.current = [];
    setIsStreaming(false);
    setMode("idle");
    setFps(0);
    console.log("🛑 Camera stopped");
  };


  // Check browser throttling
useEffect(() => {
  // Prevent tab from sleeping
  let wakeLock: any = null;
  
  if ('wakeLock' in navigator) {
    (navigator as any).wakeLock.request('screen').then((lock: any) => {
      wakeLock = lock;
      console.log('✅ Wake lock acquired');
    }).catch((err: any) => {
      console.warn('⚠️ Wake lock failed:', err);
    });
  }
  
  return () => {
    if (wakeLock) {
      wakeLock.release();
    }
  };
}, []);

  // 📤 Start publishing frames
  const startPublishingFrames = () => {
    if (loopStartedRef.current) {
      console.warn("⚠️ Frame loop already started");
      return;
    }
    
    loopStartedRef.current = true;
    frameCountRef.current = 0;
    fpsWindowRef.current = [];

    
    const targetFps = 10;
    const minFrameIntervalMs = 1000 / targetFps;
    const jpegQuality = 0.7; // Increased from 0.6
    const maxWidth = 640;


    // Setup Socket.IO
    if (!publisherSocketRef.current) {
      console.log("🔌 Connecting to WebSocket server...");
      
      // In startPublishingFrames
      const socket = io("http://localhost:4000", {
      transports: ["websocket"],
      query: { role: "publisher" },
      reconnection: true,
      reconnectionDelay: 500,        // Try every 500ms
      reconnectionDelayMax: 2000,    // Max 2s between attempts
      reconnectionAttempts: Infinity, // Never give up
      });
      socket.on("connect", () => {
        console.log("✅ WebSocket publisher connected, socket.id:", socket.id);
        console.log("✅ Socket connected:", socket.connected);
      });

      socket.on("connect_error", (err) => {
        console.error("❌ WebSocket connection error:", err.message);
      });

      socket.on("disconnect", (reason) => {
        console.warn("⚠️ Disconnected:", reason);
        if (reason === "io server disconnect") {
          socket.connect();
        }
      });

      socket.on("reconnect", (attemptNumber) => {
        console.log("✅ Reconnected after", attemptNumber, "attempts");
      });

      publisherSocketRef.current = socket;
    }

    // Start frame capture loop
    startFrameLoop();
    
    // ✅ ADD: Watchdog to restart loop if stuck
    watchdogIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const timeSinceLastFrame = now - lastFrameTimeRef.current;
      
      if (loopStartedRef.current && timeSinceLastFrame > 5000) {
        console.error("🚨 WATCHDOG: No frames for 5s! Restarting loop...");
        console.log("Debug info:", {
          loopStarted: loopStartedRef.current,
          socketConnected: publisherSocketRef.current?.connected,
          videoWidth: videoRef.current?.videoWidth,
          videoHeight: videoRef.current?.videoHeight,
          frameCount: frameCountRef.current,
        });
        
        // Try to restart loop
        if (loopRef.current) cancelAnimationFrame(loopRef.current);
        loopRef.current = null;
        startFrameLoop();
      }
    }, 5000);

    function startFrameLoop() {
      console.log("🎬 Starting frame capture loop");

      const loop = () => {
        // Check if we should continue
        if (!loopStartedRef.current) {
          console.log("🛑 Loop stopped by flag");
          return;
        }

        // Check socket connection
        if (!publisherSocketRef.current?.connected) {
          console.warn("⏳ Waiting for socket connection...");
          loopRef.current = requestAnimationFrame(loop);
          return;
        }

        const canvas = canvasRef.current;
        const video = videoRef.current;
        
        if (!canvas || !video) {
          loopRef.current = requestAnimationFrame(loop);
          return;
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          loopRef.current = requestAnimationFrame(loop);
          return;
        }

        const w = video.videoWidth;
        const h = video.videoHeight;
        
        if (w === 0 || h === 0) {
          if (frameCountRef.current === 0) {
            console.log("⏳ Waiting for video dimensions...");
          }
          loopRef.current = requestAnimationFrame(loop);
          return;
        }

        // Log first frame
        if (frameCountRef.current === 0) {
          console.log(`📹 First frame: ${w}x${h}`);
        }

        // Rate limiting
        const now = performance.now();
        const elapsed = now - lastSentRef.current;
        
        if (elapsed < minFrameIntervalMs) {
          loopRef.current = requestAnimationFrame(loop);
          return;
        }

        // Scale and draw
        const scale = Math.min(1, maxWidth / w);
        const outW = Math.round(w * scale);
        const outH = Math.round(h * scale);
        canvas.width = outW;
        canvas.height = outH;
        ctx.drawImage(video, 0, 0, outW, outH);

        // ✅ CRITICAL FIX: Schedule next frame IMMEDIATELY
        loopRef.current = requestAnimationFrame(loop);

        // Convert to JPEG and send
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              console.warn("⚠️ toBlob returned null");
              return;
            }

            // Check connection again
            if (!publisherSocketRef.current?.connected) {
              console.warn("⚠️ Socket disconnected, skipping frame");
              return;
            }

            lastSentRef.current = now;

            // Convert to bytes
            blob.arrayBuffer().then((buffer) => {
              const bytes = new Uint8Array(buffer);

              // Log first few frames
              if (frameCountRef.current < 3) {
                console.log(
                  `📤 Sending frame #${frameCountRef.current + 1}: ${bytes.length} bytes`
                );
              }

              // Emit frame
              try {
                publisherSocketRef.current?.emit("video:frame", bytes);
              } catch (err) {
                console.error("❌ Error emitting frame:", err);
              }

              // Send camera info every ~1 second
              if (frameCountRef.current % targetFps === 0) {
                const stamp = Date.now();
                const frame_id = "camera_link";
                const fx = outW * 0.9;
                const fy = outH * 0.9;
                const cx = outW / 2;
                const cy = outH / 2;

                const info = {
                  header: { stamp, frame_id },
                  height: outH,
                  width: outW,
                  distortion_model: "plumb_bob",
                  D: [0, 0, 0, 0, 0],
                  K: [fx, 0, cx, 0, fy, cy, 0, 0, 1],
                  R: [1, 0, 0, 0, 1, 0, 0, 0, 1],
                  P: [fx, 0, cx, 0, 0, fy, cy, 0, 0, 0, 1, 0],
                };

                try {
                  publisherSocketRef.current?.emit("video:camera_info", info);
                } catch (err) {
                  console.error("❌ Error emitting camera_info:", err);
                }
              }

              frameCountRef.current++;

              // Update FPS statistics
              updateFpsStats();
              
              // ✅ ADD: Update watchdog timestamp
              lastFrameTimeRef.current = Date.now();
            }).catch((err) => {
              console.error("❌ arrayBuffer error:", err);
            });
          },
          "image/jpeg",
          jpegQuality
        );
      };

      // Start the loop
      loop();
    }

    function updateFpsStats() {
      const now = Date.now();
      fpsWindowRef.current.push(now);

      // Keep last 30 frames
      if (fpsWindowRef.current.length > 30) {
        fpsWindowRef.current.shift();
      }

      // Calculate FPS every 2 seconds
      if (now - lastFpsLogRef.current > 2000) {
        const fpsWindow = fpsWindowRef.current;
        if (fpsWindow.length > 1) {
          const lastTimestamp = fpsWindow[fpsWindow.length - 1];
          const firstTimestamp = fpsWindow[0];
          
          if (lastTimestamp !== undefined && firstTimestamp !== undefined) {
            const timeSpan = (lastTimestamp - firstTimestamp) / 1000;
            const currentFps = (fpsWindow.length - 1) / timeSpan;
            setFps(Math.round(currentFps * 10) / 10);

            console.log(
              `📊 FPS: ${currentFps.toFixed(1)} | Total frames: ${frameCountRef.current}`
            );
          }
        }
        lastFpsLogRef.current = now;
      }
    }
  };

  // 🛑 Stop publishing frames
  const stopPublishingFrames = () => {
    loopStartedRef.current = false;
    
    if (loopRef.current) {
      cancelAnimationFrame(loopRef.current);
      loopRef.current = null;
    }
    
    if (watchdogIntervalRef.current) {
      clearInterval(watchdogIntervalRef.current);
      watchdogIntervalRef.current = null;
    }
    
    console.log("🛑 Frame publishing stopped");
  };

  //  Start viewer
  const startViewer = () => {
    if (viewerSocketRef.current) {
      console.warn("⚠️ Viewer already started");
      return;
    }

    console.log("Starting viewer...");

    const socket = io("http://localhost:4000", {
      transports: ["websocket"],
      query: { role: "viewer" },
    });

    viewerSocketRef.current = socket;

    socket.on("connect", () => {
      console.log("✅ Viewer connected");
    });

    socket.on("video:frame", (data: ArrayBuffer | Uint8Array) => {
      try {
        const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
        const arrBuf = buf.buffer.slice(
          buf.byteOffset,
          buf.byteOffset + buf.byteLength
        ) as ArrayBuffer;
        const blob = new Blob([arrBuf], { type: "image/jpeg" });
        const url = URL.createObjectURL(blob);
        
        // Clean up old URL
        if (lastFrameUrl) URL.revokeObjectURL(lastFrameUrl);
        setLastFrameUrl(url);
      } catch (err) {
        console.error("❌ Viewer frame error:", err);
      }
    });

    setMode("viewer");
  };

  // 🛑 Stop viewer
  const stopViewer = () => {
    if (viewerSocketRef.current) {
      viewerSocketRef.current.disconnect();
      viewerSocketRef.current = null;
    }
    if (lastFrameUrl) {
      URL.revokeObjectURL(lastFrameUrl);
      setLastFrameUrl(null);
    }
    setMode("idle");
    console.log("🛑 Viewer stopped");
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
        startViewer,
        stopViewer,
        lastFrameUrl,
        fps,
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