// src/context/MqttContext.tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import mqtt, { MqttClient } from "mqtt";
import { Buffer } from "buffer";

// ✅ Ensure Buffer exists in browser (for CameraContext base64 → Buffer conversion)
if (typeof window !== "undefined") {
  (window as any).Buffer = Buffer;
}

const MQTT_URL = "wss://broker.hivemq.com:8884/mqtt"; // 🌐 public broker (replace with your server if needed)

type MqttContextType = {
  client: MqttClient | null;
};

const MqttContext = createContext<MqttContextType>({ client: null });

export const useMqtt = () => useContext(MqttContext);

export function MqttProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<MqttClient | null>(null);

  useEffect(() => {
    // 🔌 Connect to broker
    const c = mqtt.connect(MQTT_URL, {
      reconnectPeriod: 2000,   // auto-reconnect every 2s
      connectTimeout: 30_000,  // 30s timeout
    });

    c.on("connect", () => {
      console.log("✅ MQTT connected (global)");
      setClient(c);

      // 📡 Subscribe to ROS topics for debugging
      c.subscribe(["camera/image_raw", "camera/camera_info"], (err) => {
        if (err) {
          console.error("❌ Subscribe error:", err);
        } else {
          console.log("📡 Subscribed to ROS topics [camera/image_raw, camera/camera_info]");
        }
      });
    });

    c.on("error", (err) => {
      console.error("❌ MQTT error:", err.message || err);
    });

    c.on("message", (topic, msg) => {
      console.log(`📥 MQTT message [${topic}] (${msg.length} bytes)`);
    });

    // 🧹 Cleanup on unmount
    return () => {
      try {
        c.end(true, () => {
          console.log("🔌 MQTT disconnected (cleanup)");
        });
      } catch (e) {
        console.warn("⚠️ Error ending MQTT client:", e);
      }
      setClient(null);
    };
  }, []);

  return (
    <MqttContext.Provider value={{ client }}>
      {children}
    </MqttContext.Provider>
  );
}
