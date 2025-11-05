import React, { useEffect, useState } from "react";
import Topbar from "./components/Topbar";
import Dashboard from "./pages/Dashboard";
import Modes from "./pages/Modes";
import RobotInterface from "./pages/RobotInterface";
import Controls from "./pages/Controls";
import Video from "./pages/Video";
import Gps from "./pages/Gps";
import Connectivity from "./pages/Connectivity";
import { useBots } from "./context/BotContext";
import { MqttProvider } from "./context/MqttContext";
import { CameraProvider } from "./context/CameraContext";

const API_BASE = "http://localhost:4000";

type Mode = "autonomous" | "manual";
type TabKey =
  | "dashboard"
  | "robot"
  | "controls"
  | "video"
  | "gps"
  | "connectivity"
  | "modes";

type AlertData = {
  type?: string;
  confidence?: number;
  message?: string;
  ts?: number;
};

export default function App() {
  const [mode, setMode] = useState<Mode>("manual");
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [lastAlert, setLastAlert] = useState<AlertData | null>(null);

  const [isListening, setIsListening] = useState(false);
  const toggleListening = () => setIsListening((prev) => !prev);

  const { activeBotId } = useBots();

  // ✅ Central command dispatcher
  const sendCommandToBot = async (cmd: any) => {
    if (!activeBotId) {
      console.warn("⚠️ No active bot selected, skipping command:", cmd);
      return;
    }

    // Handle arrays (multi-step commands)
    if (Array.isArray(cmd)) {
      for (const step of cmd) {
        console.log(`📡 Sending step → Bot ${activeBotId}:`, step);
        await fetch(`${API_BASE}/api/bots/${activeBotId}/commands`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: step }),
        });
      }
      return;
    }

    // Handle object or string
    console.log(`📡 Sending command → Bot ${activeBotId}:`, cmd);
    await fetch(`${API_BASE}/api/bots/${activeBotId}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: cmd }),
    });
  };

  // ✅ Handle raw commands from voice or manual controls
  const handleRawCommand = async (raw: string, from: "voice" | "control") => {
    if (!raw || !activeBotId) {
      console.warn("⚠️ No command or no active bot. Skipping.", {
        raw,
        activeBotId,
      });
      return;
    }

    try {
      let commands: any[] = [];

      console.log(`🎤 Received ${from} command:`, raw);

      if (from === "voice") {
        const res = await fetch(`${API_BASE}/api/bots/${activeBotId}/nlp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: raw }),
        });

        if (!res.ok) throw new Error(`NLP request failed with ${res.status}`);

        const data = await res.json();

        // Use commands directly from NLP
        if (Array.isArray(data.commands)) {
          commands = data.commands;
        } else if (data.command) {
          commands = [data.command];
        } else {
          console.warn("⚠️ NLP returned no command, sending raw as string");
          commands = [raw];
        }
      } else {
        console.log("Manual control command, sending to bot.");
        commands = [raw];
      }

      console.log("Final commands to send:", commands);

      for (const cmd of commands) {
        await sendCommandToBot(cmd);
      }
    } catch (err) {
      console.error("❌ Command handling failed:", err);
      console.log(" [Serial Monitor] ERROR:", err);
    }
  };

  // 🔔 AI alerts → auto open Video tab
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<AlertData>;
      setLastAlert({ ...(ce.detail || {}), ts: Date.now() });
      setTab("video");
    };

    window.addEventListener("obot:ai-alert", handler as EventListener);
    return () =>
      window.removeEventListener("obot:ai-alert", handler as EventListener);
  }, []);

  return (
    <MqttProvider>
      <CameraProvider>
        <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col">
          {/* Topbar (hidden in RobotInterface) */}
          {tab !== "robot" && (
            <Topbar
              mode={mode}
              setMode={setMode}
              isListening={isListening}
              toggleListening={toggleListening}
              onCommand={(text) => handleRawCommand(text, "voice")}
            />
          )}

          {/* Tabs */}
          {tab !== "robot" && (
            <nav className="mx-auto w-full max-w-6xl px-2 sm:px-4 pt-2 sm:pt-4">
              <div className="mb-2 sm:mb-3 flex flex-wrap gap-1 sm:gap-2 justify-center sm:justify-start">
                {(
                  [
                    "dashboard",
                    "robot",
                    "controls",
                    "video",
                    "gps",
                    "connectivity",
                  ] as TabKey[]
                ).map((k) => (
                  <button
                    key={k}
                    className={`rounded-xl sm:rounded-2xl px-2 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium transition-colors ${
                      tab === k
                        ? "bg-gray-900 text-white"
                        : "bg-white text-gray-700 border hover:bg-gray-100"
                    }`}
                    onClick={() => setTab(k)}
                  >
                    {labelFor(k)}
                  </button>
                ))}
              </div>
            </nav>
          )}

          {/* Page content */}
          <main className="flex-1 w-full mx-auto max-w-6xl px-2 sm:px-4 pb-6 sm:pb-10">
            <div className="rounded-2xl sm:rounded-3xl bg-white p-3 sm:p-5 shadow-sm">
              {tab === "dashboard" && <Dashboard setTab={setTab} mode={mode} />}
              {tab === "modes" && <Modes />}
              {tab === "robot" && <RobotInterface setTab={setTab} />}
              {tab === "controls" && (
                <Controls
                  onControlCommand={(cmd) => handleRawCommand(cmd, "control")}
                />
              )}
              {tab === "gps" && <Gps />}
              {tab === "connectivity" && <Connectivity />}

              {/* ✅ Always mounted video (hidden unless tab = video) */}
              <div style={{ display: tab === "video" ? "block" : "none" }}>
                <Video setTab={setTab} />
              </div>
            </div>
          </main>
        </div>
      </CameraProvider>
    </MqttProvider>
  );
}

// Tab label helper
function labelFor(k: TabKey) {
  switch (k) {
    case "dashboard":
      return "Dashboard";
    case "robot":
      return "Interface";
    case "controls":
      return "Controls";
    case "video":
      return "Video";
    case "gps":
      return "GPS";
    case "connectivity":
      return "Connectivity";
  }
}
