import React, { useState } from "react";

export default function Modes() {
  const [status, setStatus] = useState<string>("Idle...");

  const callApi = async (endpoint: string) => {
    try {
      setStatus(`⏳ Running: ${endpoint}`);
      const res = await fetch(`http://localhost:4000/api/ros2/${endpoint}`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setStatus(`✅ Success: ${endpoint}`);
      } else {
        setStatus(`❌ Failed: ${endpoint}`);
      }
    } catch (err) {
      console.error(err);
      setStatus(`⚠️ Error calling ${endpoint}`);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Robot modesss</h1>
      <p className="text-gray-600">Control SLAM, mapping, and patrol functions.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <button
          onClick={() => callApi("start_slam")}
          className="rounded-xl bg-blue-600 text-white px-4 py-3 hover:bg-blue-700 transition"
        >
           Start SLAM
        </button>

        <button
          onClick={() => callApi("save_map")}
          className="rounded-xl bg-green-600 text-white px-4 py-3 hover:bg-green-700 transition"
        >
           Save Map
        </button>

        <button
          onClick={() => callApi("start_patrol")}
          className="rounded-xl bg-purple-600 text-white px-4 py-3 hover:bg-purple-700 transition"
        >
           Start Patrol
        </button>

        <button
          onClick={() => callApi("stop_patrol")}
          className="rounded-xl bg-red-600 text-white px-4 py-3 hover:bg-red-700 transition"
        >
          🛑 Stop Patrol
        </button>
      </div>

      <div className="mt-6 p-4 rounded-lg bg-gray-100 text-gray-800">
        <strong>Status:</strong> {status}
      </div>
    </div>
  );
}
