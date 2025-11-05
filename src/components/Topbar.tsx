import React, { useEffect, useRef, useState } from "react";
import { Battery, Mic } from "lucide-react";
import { useBots } from "../context/BotContext";


declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

type Props = {
  mode: "autonomous" | "manual";
  setMode: (m: "autonomous" | "manual") => void;
  isListening: boolean;
  toggleListening: () => void;
  onCommand: (command: string) => void; // raw transcript → App.tsx
};

export default function Topbar({
  mode,
  setMode,
  isListening,
  toggleListening,
  onCommand,
}: Props) {
  const { licensedBots, activeBotId, setActiveBot } = useBots();
  const connectedBots = licensedBots.filter((b) => b.connected);

  const recognitionRef = useRef<any>(null);
  const [speedRecognition, setSpeedRecognition] = useState(false);

  const batteryLevel = 84;
  const batteryStatus =
    batteryLevel > 60
      ? "text-emerald-400"
      : batteryLevel > 30
      ? "text-yellow-400"
      : "text-red-500";

  // 🎤 SpeechRecognition → only capture transcript
  useEffect(() => {
    if (!isListening || !activeBotId) return;
  
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error("❌ SpeechRecognition not supported");
      return;
    }
  
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
  
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";
  
    let transcriptBuffer = "";
    let silenceTimer: NodeJS.Timeout;
    const SILENCE_MS = 500; // wait 3s of silence before sending
  
    recognition.onresult = (event: any) => {
      let finalTranscript = "";
  
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript.trim() + " ";
        }
      }
  
      if (!finalTranscript.trim()) return;
  
      transcriptBuffer += (transcriptBuffer ? " " : "") + finalTranscript.trim(); 
  
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        if (transcriptBuffer) {
          onCommand(transcriptBuffer); // send full command
          transcriptBuffer = "";
        }
      }, SILENCE_MS);
    };
  
    recognition.onerror = (event: any) => {
      console.error("🎤 Recognition error:", event.error);
      // optionally stop recognition on fatal errors
      // recognition.stop();
    };
  
    recognition.onend = () => {
      // ❌ remove any restart
      console.log("🎤 Recognition ended (manual toggle only stops it)");
    };
  
    recognition.start();
    console.log("🎤 Recognition initialized");
  
    return () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      recognition.stop(); // stop only when manually toggled off
    };
  
  // ⚠️ NOTE: use empty dependency array to avoid restarting
  }, [isListening]);
  
  return (
    <header className="sticky top-0 z-40 border-b border-blue-900 bg-gradient-to-r from-gray-800 via-gray-900 to-cyan-950 backdrop-blur-xl shadow-lg">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-2 py-1 sm:px-4 sm:py-3 text-white">
        {/* Logo + Title */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-[140px]">
          <div className="grid h-7 w-7 sm:h-11 sm:w-11 place-items-center rounded-2xl bg-gradient-to-br from-cyan-600 to-blue-700 shadow-lg">
            <img src="/imgs/img-obot.png" alt="Obot" className="h-5 sm:h-8" />
          </div>
          <div>
            <h1 className="text-sm sm:text-lg font-bold tracking-wide">
              Obot Control Panel
            </h1>
            <p className="text-[9px] sm:text-xs text-gray-400">
              Mode:{" "}
              <span
                className={`font-semibold ${
                  mode === "autonomous"
                    ? "text-cyan-400"
                    : "text-blue-400"
                }`}
              >
                {mode.toUpperCase()}
              </span>
            </p>
          </div>
        </div>

        {/* Right-side controls */}
        <div className="flex flex-wrap items-center gap-1 sm:gap-4">
          {/* Battery */}
          <div className="flex items-center gap-1 text-[10px] sm:text-sm">
            <Battery className={`h-3 w-3 sm:h-5 sm:w-5 ${batteryStatus}`} />
            <span className="font-medium">{batteryLevel}%</span>
          </div>

          {/* Mic Toggle */}
          <button
            className="flex items-center gap-1 rounded-2xl bg-gradient-to-r from-blue-700 via-cyan-700 to-blue-700 px-3 py-1 sm:px-3 sm:py-2 text-[8px] sm:text-sm font-semibold shadow-md hover:scale-105 transition-transform"
            onClick={toggleListening}
          >
            <Mic className="h-3 w-3 sm:h-4 sm:w-5" />
            {isListening ? "Stop Listening" : "AI Assistant"}
          </button>

          {/* Mode toggle + Bot selector */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              className={`rounded-2xl px-2 py-1 sm:px-3 sm:py-2 text-[9px] sm:text-xs font-medium shadow-sm ${
                mode === "autonomous"
                  ? "bg-cyan-600 text-white shadow-cyan-500/40"
                  : "bg-gray-700 text-gray-300"
              }`}
              onClick={() => setMode("autonomous")}
            >
              Autonomous
            </button>
            <button
              className={`rounded-2xl px-2 py-1 sm:px-3 sm:py-2 text-[9px] sm:text-xs font-medium shadow-sm ${
                mode === "manual"
                  ? "bg-blue-600 text-white shadow-blue-500/40"
                  : "bg-gray-700 text-gray-300"
              }`}
              onClick={() => setMode("manual")}
            >
              Manual
            </button>

            {connectedBots.length > 0 && (
              <select
                value={activeBotId ?? ""}
                onChange={(e) => setActiveBot(e.target.value)}
                className="bg-transparent text-white border-b-2 border-gray-300 p-1 rounded-md"
              >
                <option value="">Select Bot</option>
                {connectedBots.map((bot) => (
                  <option key={bot.id} value={bot.id}>
                    {bot.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
