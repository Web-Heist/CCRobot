// src/pages/Connectivity.tsx
import React, { useState } from "react";
import { X } from "lucide-react";
import { useBots } from "../context/BotContext";

export default function Connectivity() {
  const {
    availableBots,
    licensedBots,
    connectBot,
    disconnectBot,
    setActiveBot,
    activeBotId,
    verifyBot,
    removeLicensedBot,
  } = useBots();

  const [selectedBot, setSelectedBot] = useState<string | null>(null);
  const [licenseKey, setLicenseKey] = useState("");
  const [verifying, setVerifying] = useState(false);

  return (
    
    <div className="p-3 sm:p-4 md:p-6 bg-gray-900 rounded-2xl text-white shadow-2xl h-full">
      <div className="mb-4 py-2 px-3 bg-gradient-to-r from-gray-800 to-gray-700 rounded-xl shadow-lg text-center">
        <h2 className="text-lg sm:text-xl md:text-2xl font-semibold text-blue-400">
          A Connection To Another Eye
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Nearby (online) */}
        <div className="bg-gray-800 rounded-xl p-3 flex flex-col">
          <h3 className="text-cyan-400 font-semibold mb-2">Available Bots Nearby</h3>
          <div className="flex-1 space-y-2 overflow-y-auto max-h-[18rem] pr-1">
            {availableBots.length === 0 ? (
              <p className="text-gray-500">No bots online nearby.</p>
            ) : availableBots.map((b) => (
              <div key={b.id} className="flex items-center justify-between p-2 bg-gray-700 rounded-md">
                <div className="min-w-0">
                  <div className="font-bold truncate">{b.name}</div>
                  <div className="text-xs text-gray-400 truncate">{b.id}</div>
                </div>
                <button
                  onClick={() => { setSelectedBot(b.id); setLicenseKey(""); }}
                  className="px-3 py-1 rounded-md bg-gradient-to-r from-blue-600 to-cyan-600 text-xs font-semibold"
                >
                  Add
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Your Bots (licensed) */}
        <div className="bg-gray-800 rounded-xl p-3 flex flex-col">
          <h3 className="text-green-400 font-semibold mb-2">Your Bots</h3>
          <div className="flex-1 space-y-2 overflow-y-auto max-h-[18rem] pr-1">
            {licensedBots.length === 0 ? (
              <p className="text-gray-500">No licensed bots yet.</p>
            ) : licensedBots.map((b) => (
              <div
                key={b.id}
                className={`flex items-center justify-between p-2 rounded-md ${
                  activeBotId === b.id ? "bg-gray-700 border border-cyan-500" : "bg-gray-700/80"
                }`}
              >
                <div className="min-w-0">
                  <div className="font-bold truncate">{b.name}</div>
                  <div className="text-xs text-gray-400">
                    {b.status === "online" ? <span className="text-emerald-300">Online</span> : <span className="text-gray-400">Offline</span>}
                    {" • "}
                    {b.connected ? <span className="text-cyan-200">Linked</span> : <span>Not linked</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveBot(b.id)}
                    className={`px-2 py-1 rounded-md text-xs ${activeBotId === b.id ? "bg-cyan-600" : "bg-gray-600"}`}
                  >
                    {activeBotId === b.id ? "Active" : "Set Active"}
                  </button>

                  {b.connected ? (
                    <button onClick={() => disconnectBot(b.id)} className="px-2 py-1 text-xs rounded-md bg-red-600">Unlink</button>
                  ) : (
                    <button onClick={() => connectBot(b.id)} className="px-2 py-1 text-xs rounded-md bg-green-600">Link</button>
                  )}

                  <button
                    onClick={(e) => { e.stopPropagation(); removeLicensedBot(b.id); }}
                    title="Forget bot"
                    className="h-6 w-6 flex items-center justify-center rounded-full text-gray-300 hover:text-red-400"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* License modal */}
      {selectedBot && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="bg-gray-800 rounded-xl p-4 w-11/12 max-w-md">
            <h4 className="text-cyan-400 font-semibold mb-2">Enter License Key</h4>
            <input
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              placeholder="e.g. Obot-KEY-123"
              className="w-full rounded-md px-3 py-2 mb-3 text-black"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setSelectedBot(null)} className="px-3 py-1 rounded-md bg-gray-600">Cancel</button>
              <button
                onClick={async () => {
                  if (!selectedBot) return;
                  setVerifying(true);
                  const ok = await verifyBot(selectedBot, licenseKey);
                  setVerifying(false);
                  if (!ok) {
                    alert("License verification failed (device offline or wrong key).");
                    return;
                  }
                  setSelectedBot(null);
                  setLicenseKey("");
                }}
                disabled={verifying || !licenseKey}
                className="px-3 py-1 rounded-md bg-gradient-to-r from-blue-600 to-cyan-600 disabled:opacity-60"
              >
                {verifying ? "Verifying..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
