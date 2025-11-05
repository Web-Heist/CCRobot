import React, { useRef, useState, useEffect } from "react";
import { useBots } from "../context/BotContext";
import { useCamera } from "../context/CameraContext"; // ✅ import camera context

type JoystickPos = { x: number; y: number };

type ControlsProps = {
  voiceCommand?: string; // Raw text from Topbar
  onControlCommand: (cmd: string) => void; // Passes command up to App.tsx
};

export default function Controls({ voiceCommand, onControlCommand }: ControlsProps) {
  const { activeBotId } = useBots();
  const { stream } = useCamera(); // ✅ shared camera stream
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [feedback, setFeedback] = useState<string[]>([]);
  const [leftStick, setLeftStick] = useState<JoystickPos>({ x: 0, y: 0 });
  const [rightStick, setRightStick] = useState<JoystickPos>({ x: 0, y: 0 });
  const [pan, setPan] = useState<JoystickPos>({ x: 0, y: 0 });
  const [tilt, setTilt] = useState<JoystickPos>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0);

  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<HTMLDivElement | null>(null);
  const tiltRef = useRef<HTMLDivElement | null>(null);

  const [moveSize, setMoveSize] = useState(120);
  const [ptzSize, setPtzSize] = useState(90);

  // ✅ attach camera stream to video element
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Responsive joystick sizing
  useEffect(() => {
    const adjustSize = () => {
      if (window.innerWidth < 700) {
        setMoveSize(90);
        setPtzSize(80);
      } else if (window.innerWidth < 900) {
        setMoveSize(95);
        setPtzSize(80);
      } else {
        setMoveSize(120);
        setPtzSize(90);
      }
    };
    adjustSize();
    window.addEventListener("resize", adjustSize);
    return () => window.removeEventListener("resize", adjustSize);
  }, []);

  const addFeedback = (msg: string) =>
    setFeedback((prev) => [msg, ...prev.slice(0, 49)]);

  // Voice command from Topbar → App
  useEffect(() => {
    if (voiceCommand) {
      addFeedback(`🎤 Voice: ${voiceCommand}`);
      onControlCommand(voiceCommand); // pass raw up
    }
  }, [voiceCommand, onControlCommand]);

  // Keyboard controls
  useEffect(() => {
    const pressed = new Set<string>();
    const updateKeys = () => {
      const up = pressed.has("ArrowUp") || pressed.has("w");
      const down = pressed.has("ArrowDown") || pressed.has("s");
      const left = pressed.has("ArrowLeft") || pressed.has("a");
      const right = pressed.has("ArrowRight") || pressed.has("d");

      setLeftStick({
        x: left ? -40 : right ? 40 : 0,
        y: up ? -40 : down ? 40 : 0,
      });
      setRightStick({
        x: left ? -40 : right ? 40 : 0,
        y: up ? -40 : down ? 40 : 0,
      });

      if (up) onControlCommand("move.forward");
      if (down) onControlCommand("move.backward");
      if (left) onControlCommand("move.left");
      if (right) onControlCommand("move.right");
      if (!up && !down && !left && !right) onControlCommand("move.stop");
    };

    const downHandler = (e: KeyboardEvent) => {
      pressed.add(e.key);
      updateKeys();
    };
    const upHandler = (e: KeyboardEvent) => {
      pressed.delete(e.key);
      updateKeys();
    };

    window.addEventListener("keydown", downHandler);
    window.addEventListener("keyup", upHandler);
    return () => {
      window.removeEventListener("keydown", downHandler);
      window.removeEventListener("keyup", upHandler);
    };
  }, [onControlCommand]);

  // Gamepad controls
  useEffect(() => {
    const dead = 0.3;
    const loop = () => {
      const gp = navigator.getGamepads()[0];
      if (gp) {
        const lx = gp.axes[0] ?? 0;
        const ly = gp.axes[1] ?? 0;
        setLeftStick({
          x: Math.abs(lx) > dead ? lx * 40 : 0,
          y: Math.abs(ly) > dead ? ly * 40 : 0,
        });
        if (Math.abs(ly) > dead)
          onControlCommand(ly < 0 ? "move.forward" : "move.backward");
        if (Math.abs(lx) > dead)
          onControlCommand(lx < 0 ? "move.left" : "move.right");
        if (Math.abs(lx) <= dead && Math.abs(ly) <= dead)
          onControlCommand("move.stop");
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }, [onControlCommand]);

  // --- Render ---
  return (
    <div className="p-4 bg-gray-900 min-h-screen flex flex-col gap-4">
      {/* Camera */}
      <div className="relative w-full aspect-video rounded-3xl overflow-hidden shadow-lg border-2 border-gray-700">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          autoPlay
          muted
          playsInline
        />
        <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
          Live Camera
        </div>
      </div>

      <div className="flex flex-col md:grid md:grid-cols-3 gap-6 h-full">
        {/* Movement */}
        <div className="flex flex-col items-center gap-4 bg-gray-800 rounded-2xl p-4 shadow-lg w-full">
          <div className="text-white font-semibold">Movement</div>
          <div className="flex gap-4 flex-wrap md:flex-nowrap">
            <Joystick
              ref={leftRef}
              pos={leftStick}
              setPos={setLeftStick}
              size={moveSize}
              axis="both"
            />
            <Joystick
              ref={rightRef}
              pos={rightStick}
              setPos={setRightStick}
              size={moveSize}
              axis="both"
            />
          </div>
        </div>

        {/* Camera PTZ */}
        <div className="flex flex-col items-center gap-4 bg-gray-800 p-4 rounded-2xl shadow-lg">
          <div className="text-white font-semibold">Camera PTZ</div>
          <div className="flex gap-4">
            <Joystick ref={panRef} pos={pan} setPos={setPan} size={ptzSize} axis="x" />
            <Joystick ref={tiltRef} pos={tilt} setPos={setTilt} size={ptzSize} axis="y" />
          </div>

          <label className="text-sm text-gray-300 mt-2">Zoom</label>
          <input
            type="range"
            min={-100}
            max={100}
            value={zoom}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              setZoom(val);
              onControlCommand(`zoom:${val}`);
              addFeedback(`Zoom: ${val}`);
            }}
            className="w-full accent-pink-500"
          />
        </div>

        {/* Actions + Feedback */}
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Taser", cmd: "taser" },
              { label: "Spray", cmd: "spray" },
              { label: "Flash", cmd: "flash" },
              { label: "Siren", cmd: "siren" },
            ].map((btn, i) => (
              <button
                key={i}
                onClick={() => {
                  addFeedback(`${btn.label} activated`);
                  onControlCommand(btn.cmd);
                }}
                className="bg-gradient-to-r from-blue-900 via-cyan-700 to-blue-900 text-white font-semibold py-2 rounded-lg shadow-md transition-all duration-300"
              >
                {btn.label}
              </button>
            ))}
          </div>

          <div className="bg-gray-800 rounded-xl p-3 shadow-inner flex-1 overflow-y-auto max-h-64">
            <div className="flex justify-between items-center mb-2">
              <div className="text-white font-medium">Feedback Log</div>
              <button
                className="text-xs text-gray-400 hover:text-white"
                onClick={() => setFeedback([])}
              >
                Clear
              </button>
            </div>
            <ul className="text-sm text-gray-300 space-y-1">
              {feedback.length === 0 ? (
                <li>No actions yet</li>
              ) : (
                feedback.map((msg, i) => <li key={i}>{msg}</li>)
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Joystick Component ---
const Joystick = React.forwardRef<
  HTMLDivElement,
  {
    pos: JoystickPos;
    setPos: React.Dispatch<React.SetStateAction<JoystickPos>>;
    size?: number;
    axis?: "both" | "x" | "y";
  }
>(({ pos, setPos, size = 120, axis = "both" }, ref) => {
  const handleMove = (e: any) => {
    e.preventDefault();
    const base = ref as React.RefObject<HTMLDivElement>;
    if (!base.current) return;
    const rect = base.current.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX : e.clientX;
    const y = "touches" in e ? e.touches[0].clientY : e.clientY;
    const dx = x - (rect.left + rect.width / 2);
    const dy = y - (rect.top + rect.height / 2);
    const radius = rect.width / 2 - 20;
    const distance = Math.min(Math.hypot(dx, dy), radius);
    const angle = Math.atan2(dy, dx);
    setPos({
      x: axis === "y" ? 0 : Math.cos(angle) * distance,
      y: axis === "x" ? 0 : Math.sin(angle) * distance,
    });
  };

  const stop = () => setPos({ x: 0, y: 0 });

  return (
    <div
      ref={ref}
      className="relative bg-gray-700 rounded-full border-4 border-cyan-500 shadow-inner"
      style={{ width: size, height: size }}
      onMouseDown={(e) => {
        handleMove(e);
        const onMove = (ev: any) => handleMove(ev);
        window.addEventListener("mousemove", onMove);
        window.addEventListener(
          "mouseup",
          () => {
            stop();
            window.removeEventListener("mousemove", onMove);
          },
          { once: true }
        );
      }}
      onTouchStart={(e) => {
        handleMove(e);
        const onMove = (ev: any) => handleMove(ev);
        window.addEventListener("touchmove", onMove);
        window.addEventListener(
          "touchend",
          () => {
            stop();
            window.removeEventListener("touchmove", onMove);
          },
          { once: true }
        );
      }}
    >
      <div
        className="absolute w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-full shadow-xl transform -translate-x-1/2 -translate-y-1/2 transition-all"
        style={{ left: `${pos.x + size / 2}px`, top: `${pos.y + size / 2}px` }}
      />
    </div>
  );
});
