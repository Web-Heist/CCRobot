// src/lib/api.ts
import { API_BASE } from "../config";

export async function fetchBots() {
  const res = await fetch(`${API_BASE}/api/bots`);
  if (!res.ok) throw new Error("Failed to fetch bots");
  return res.json();
}

export async function sendCommand(botId: string, command: string) {
  const res = await fetch(`${API_BASE}/api/bots/${encodeURIComponent(botId)}/commands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to send command");
  }
  return res.json();
}
