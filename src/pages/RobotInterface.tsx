import React, { useState, useEffect } from "react";

type Props = {
  setTab: (
    t: "dashboard" | "robot" | "controls" | "video" | "connectivity" | "gps"
  ) => void;
};

export default function RobotInterface({ setTab }: Props) {
  const [showNav, setShowNav] = useState(false);
  const [listening, setListening] = useState(false);

  // Auto-hide nav after 2s when shown
  useEffect(() => {
    if (showNav) {
      const timer = setTimeout(() => setShowNav(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [showNav]);

  // Fake "voice detection" toggle every few seconds (for demo)
  useEffect(() => {
    const interval = setInterval(() => {
      setListening((prev) => !prev);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-black via-gray-900 to-black overflow-hidden"
      onClick={() => setShowNav(true)}
    >
      {/* Neon Circle with different animation states */}
      <div
        className={`absolute rounded-full border-[5px] border-blue-400 shadow-[0_0_120px_rgba(0,120,255,0.8)] 
          transition-all duration-500
          ${
            listening
              ? "w-[60vmin] h-[60vmin] animate-organic-blue"
              : "w-[60vmin] h-[60vmin] animate-organic-blue"
          }`}
      />

      {/* Temporary Nav */}
      {showNav && (
        <div className="absolute top-6 flex gap-2">
          {["dashboard", "controls", "video", "connectivity", "gps"].map((k) => (
            <button
              key={k}
              onClick={() => setTab(k as any)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-900 via-cyan-700 to-blue-900 
              hover:from-blue-800 hover:via-blue-700 hover:to-blue-500 text-white text-sm font-medium shadow hover:bg-cyan-500 transition"
            >
              {k.charAt(0).toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
