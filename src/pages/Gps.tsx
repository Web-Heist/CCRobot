import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import * as L from "leaflet"; // use * as L for TypeScript
import mqtt from "mqtt";

// Fix default Leaflet marker icon issue
(delete (L.Icon.Default.prototype as any)._getIconUrl);
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Bot type
interface Bot {
  id: string;
  name: string;
  lat?: number;
  lon?: number;
  status: string;
  lastUpdate?: number;
  connected?: boolean;
}

// Custom marker colors
const markerColors = [
  "blue",
  "red",
  "green",
  "orange",
  "purple",
  "darkred",
  "cadetblue",
  "darkgreen",
];

export default function Gps() {
  const [bots, setBots] = useState<Bot[]>([]);

  useEffect(() => {
    const client = mqtt.connect("ws://broker.hivemq.com:8000/mqtt");
  
    client.on("connect", () => {
      console.log("✅ Connected to MQTT broker");
      client.subscribe("bot/+/gps");
    });
  
    const fetchBots = async () => {
      try {
        const res = await fetch("http://localhost:4000/api/bots");
        const data = await res.json();
        const connectedBots: Bot[] = data
          .filter((b: any) => b.connected && b.lat !== undefined && b.lon !== undefined)
          .map((b: any) => ({
            id: b.id ?? Math.random().toString(),
            name: b.name ?? "Unknown",
            lat: b.lat,
            lon: b.lon,
            status: b.status ?? "offline",
            lastUpdate: b.lastUpdate,
            connected: true,
          }));
        setBots(connectedBots);
      } catch (err) {
        console.error("Failed to fetch bots", err);
      }
    };
    fetchBots();
    const interval = setInterval(fetchBots, 5000);
  
    client.on("message", (topic, payload) => {
      console.log("📩 MQTT message:", topic, payload.toString());
      try {
        const msg = JSON.parse(payload.toString());
        const botId = topic.split("/")[1];
    
        console.log("Parsed botId:", botId, "Message:", msg);
    
        setBots((prev) => {
          const existing = prev.find((b) => b.id === botId);
          const updatedBot: Bot = {
            id: botId!,
            name: msg.name ?? existing?.name ?? "Unknown",
            lat: msg.lat,
            lon: msg.lon,
            status: msg.status ?? existing?.status ?? "online",
            lastUpdate: Date.now(),
            connected: true,
          };
    
          if (existing) {
            return prev.map((b) => (b.id === botId ? updatedBot : b));
          } else {
            return [...prev, updatedBot];
          }
        });
      } catch (err) {
        console.error("MQTT parse error", err);
      }
    });
    
    
    
  
    return () => {
      clearInterval(interval);
      client.end();
    };
  }, []);
  
  const defaultPosition: [number, number] = [33.6844, 73.0479];

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 p-4 sm:p-6 bg-gray-900 rounded-3xl shadow-2xl">
      {/* Live Map */}
      <div className="col-span-1 sm:col-span-2 lg:col-span-2 relative rounded-2xl border border-yellow-500/50 bg-gray-800/70 p-4 sm:p-6 text-yellow-300 shadow-lg hover:shadow-yellow-500/40 transition-all duration-300">
        <h3 className="text-xs sm:text-sm uppercase tracking-wider text-yellow-500">
          Live GPS Map
        </h3>
        <div className="mt-3 h-60 sm:h-80 rounded-xl overflow-hidden">
          <MapContainer
            center={
              bots.length > 0
                ? [bots[0]?.lat ?? defaultPosition[0], bots[0]?.lon ?? defaultPosition[1]]
                : defaultPosition
            }
            zoom={13}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {bots.map((bot, idx) => {
              const color = markerColors[idx % markerColors.length];
              const customIcon = new L.Icon({
                iconUrl: `https://chart.googleapis.com/chart?chst=d_map_pin_icon&chld=robot|${color}`,
                iconSize: [30, 50],
                iconAnchor: [15, 50],
                popupAnchor: [0, -50],
              });

              return (
                <Marker key={bot.id} position={[bot.lat ?? 0, bot.lon ?? 0]} icon={customIcon}>
                  <Popup>
                    <div className="text-sm font-bold">{bot.name}</div>
                    <div>Lat: {bot.lat?.toFixed(4) ?? "-"}</div>
                    <div>Lon: {bot.lon?.toFixed(4) ?? "-"}</div>
                    <div>Status: {bot.status}</div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
        <p className="mt-2 text-[10px] sm:text-xs text-gray-400">
          Displays all connected bots on map with unique markers.
        </p>
      </div>

      {/* Coordinates */}
      <div className="rounded-2xl border border-cyan-500/50 bg-gray-800/70 p-4 sm:p-6 text-cyan-300 shadow-lg hover:shadow-cyan-500/40 transition-all duration-300">
        <h3 className="text-xs sm:text-sm uppercase tracking-wider text-cyan-500">
          Coordinates
        </h3>
        {bots.length > 0 ? (
          <>
            <div className="mt-3 text-sm sm:text-base font-bold">
              Lat: <span className="text-cyan-400">{bots[0]?.lat?.toFixed(4) ?? "-"}</span>
            </div>
            <div className="text-sm sm:text-base font-bold">
              Long: <span className="text-cyan-400">{bots[0]?.lon?.toFixed(4) ?? "-"}</span>
            </div>
          </>
        ) : (
          <div className="mt-3 text-sm sm:text-base font-bold text-gray-400">No bots connected</div>
        )}
        <p className="mt-2 text-[10px] sm:text-xs text-gray-400">
          Real-time GPS coordinates of the first connected robot.
        </p>
      </div>

      {/* Status Panel */}
      <div className="rounded-2xl border border-emerald-500/50 bg-gray-800/70 p-4 sm:p-6 text-emerald-300 shadow-lg hover:shadow-emerald-500/40 transition-all duration-300">
        <h3 className="text-xs sm:text-sm uppercase tracking-wider text-emerald-500">
          GPS Status
        </h3>
        <div className="mt-3 text-sm sm:text-base font-semibold text-emerald-400">
          {bots.length > 0 ? "✅ Connected" : "❌ No bots"}
        </div>
        <p className="mt-2 text-[10px] sm:text-xs text-gray-400">
          Last update: {bots[0]?.lastUpdate ? new Date(bots[0].lastUpdate).toLocaleTimeString() : "-"}
        </p>
      </div>
    </div>
  );
}
