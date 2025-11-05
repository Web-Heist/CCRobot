import React from "react";

type Props = {
  setTab: (
    t: "dashboard" |"modes"| "robot" | "controls" | "video" | "gps" | "connectivity"
  ) => void;
  mode: "autonomous" | "manual";
};

export default function Dashboard({ setTab, mode }: Props) {
  return (
    <div
      className="
        grid gap-4 
        grid-cols-2        /* 📱 mobile: 2 per row */
        md:grid-cols-2     /* 💻 medium screens: 2 per row */
        lg:grid-cols-2    /* 🖥️ large: 2 per row */
        p-4 sm:p-6 
        bg-gray-900 rounded-3xl shadow-2xl
      "
    >
      {/* Mode Status → Clickable to open Modes page */}
<button
  onClick={() => setTab("modes")}
  className="relative rounded-2xl border border-cyan-500/50 bg-gray-800/70 p-4 sm:p-6 text-cyan-300 shadow-lg hover:shadow-cyan-500/40 hover:scale-[1.02] transition-all duration-300 text-left"
>
  <h3 className="text-xs sm:text-sm uppercase tracking-wider text-cyan-600">
    Mode
  </h3>
  <div className="mt-2 sm:mt-3 text-lg sm:text-xl font-bold">
    {mode === "autonomous" ? (
      <span className="text-cyan-400 animate-pulse">AUTONOMOUS</span>
    ) : (
      <span className="text-blue-400">MANUAL</span>
    )}
  </div>
  <p className="mt-2 sm:mt-3 text-[10px] sm:text-xs text-gray-400">
    Click to manage Patrol, Mapping, and SLAM.
  </p>
  <div className="absolute inset-0 rounded-2xl border border-cyan-500/20 animate-pulse pointer-events-none"></div>
</button>


      {/* Robot Interface */}
      <button
        onClick={() => setTab("robot")}
        className="group relative rounded-2xl border border-purple-500/50 bg-gray-800/70 p-4 sm:p-6 text-left text-purple-300 shadow-lg hover:shadow-purple-500/40 hover:scale-[1.02] transition-all duration-300"
      >
        <div className="text-sm sm:text-lg font-bold tracking-wide group-hover:text-purple-400">
          🤖 Robot Interface
        </div>
        <p className="mt-1 sm:mt-2 text-[10px] sm:text-xs text-gray-400">
          Access the assistant face and interactive UI.
        </p>
      </button>

      {/* Video */}
      <button
        onClick={() => setTab("video")}
        className="group relative rounded-2xl border border-pink-500/50 bg-gray-800/70 p-4 sm:p-6 text-left text-pink-300 shadow-lg hover:shadow-pink-500/40 hover:scale-[1.02] transition-all duration-300"
      >
        <div className="text-sm sm:text-lg font-bold tracking-wide group-hover:text-pink-400">
          🎥 Video Stream
        </div>
        <p className="mt-1 sm:mt-2 text-[10px] sm:text-xs text-gray-400">
          Watch live feed, take snapshots, and record.
        </p>
      </button>

      {/* Controls */}
      <button
        onClick={() => setTab("controls")}
        className="group relative rounded-2xl border border-emerald-500/50 bg-gray-800/70 p-4 sm:p-6 text-left text-emerald-300 shadow-lg hover:shadow-emerald-500/40 hover:scale-[1.02] transition-all duration-300"
      >
        <div className="text-sm sm:text-lg font-bold tracking-wide group-hover:text-emerald-400">
          🎮 Controls
        </div>
        <p className="mt-1 sm:mt-2 text-[10px] sm:text-xs text-gray-400">
          Drive the robot, control the gimbal, and activate tools.
        </p>
      </button>

      {/* GPS */}
      <button
        onClick={() => setTab("gps")}
        className="group relative rounded-2xl border border-yellow-500/50 bg-gray-800/70 p-4 sm:p-6 text-left text-yellow-300 shadow-lg hover:shadow-yellow-500/40 hover:scale-[1.02] transition-all duration-300"
      >
        <div className="text-sm sm:text-lg font-bold tracking-wide group-hover:text-yellow-400">
          📍 GPS
        </div>
        <p className="mt-1 sm:mt-2 text-[10px] sm:text-xs text-gray-400">
          Track live location where robot patroling.
        </p>
      </button>

      {/* Connectivity */}
      <button
        onClick={() => setTab("connectivity")}
        className="group relative rounded-2xl border border-indigo-500/50 bg-gray-800/70 p-4 sm:p-6 text-left text-indigo-300 shadow-lg hover:shadow-indigo-500/40 hover:scale-[1.02] transition-all duration-300"
      >
        <div className="text-sm sm:text-lg font-bold tracking-wide group-hover:text-indigo-400">
          🔌 Connectivity
        </div>
        <p className="mt-1 sm:mt-2 text-[10px] sm:text-xs text-gray-400">
          Monitor Wi-Fi, Bluetooth, and server link status.
        </p>
      </button>
    </div>
  );
}
