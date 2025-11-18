// src/context/MqttContext.tsx
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import mqtt, { type IClientOptions, type IClientSubscribeOptions, MqttClient } from "mqtt";
import { Buffer } from "buffer";

// ✅ Ensure Buffer exists in browser (for CameraContext base64 → Buffer conversion)
if (typeof window !== "undefined") {
  (window as any).Buffer = Buffer;
}

const MQTT_URL = "wss://broker.hivemq.com:8884/mqtt"; // replace with your broker

type MqttContextType = {
  client: MqttClient | null;
  isConnected: boolean;
  publish: (topic: string, payload: string | Uint8Array, opts?: Parameters<MqttClient["publish"]>[2]) => void;
  subscribe: (topic: string | string[], opts?: IClientSubscribeOptions) => Promise<void>;
  unsubscribe: (topic: string | string[]) => Promise<void>;
};

const MqttContext = createContext<MqttContextType>({ client: null, isConnected: false, publish: () => {}, subscribe: async () => {}, unsubscribe: async () => {} });

export const useMqtt = () => useContext(MqttContext);

export function MqttProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<MqttClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const connectedRef = useRef(false);

  useEffect(() => {
    // 🔌 Connect to broker
    const options: IClientOptions = {
      reconnectPeriod: 2000,
      connectTimeout: 30_000,
      keepalive: 30,
      clean: true,
    };
    const c = mqtt.connect(MQTT_URL, options);

    c.on("connect", () => {
      console.log("✅ MQTT connected (global)");
      setClient(c);
      connectedRef.current = true;
      setIsConnected(true);
    });

    c.on("reconnect", () => {
      console.log("♻️ MQTT reconnecting...");
    });

    c.on("error", (err) => {
      console.error("❌ MQTT error:", err?.message || err);
    });

    c.on("close", () => {
      if (connectedRef.current) {
        console.log("🔌 MQTT disconnected");
      }
      connectedRef.current = false;
      setIsConnected(false);
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
      setIsConnected(false);
    };
  }, []);

  const api = useMemo(() => {
    const publish: MqttContextType["publish"] = (topic, payload, opts) => {
      if (!client || !connectedRef.current) return;
      try {
        client.publish(topic, payload as any, opts);
      } catch (e) {
        console.warn("⚠️ MQTT publish failed:", e);
      }
    };

    const subscribe: MqttContextType["subscribe"] = (topic, opts) => {
      return new Promise((resolve, reject) => {
        if (!client) {
          reject(new Error("MQTT not connected"));
          return;
        }
        client.subscribe(topic as any, opts, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    };

    const unsubscribe: MqttContextType["unsubscribe"] = (topic) => {
      return new Promise((resolve, reject) => {
        if (!client) {
          resolve();
          return;
        }
        client.unsubscribe(topic as any, (err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });
    };

    return { publish, subscribe, unsubscribe };
  }, [client]);

  return (
    <MqttContext.Provider value={{ client, isConnected, publish: api.publish, subscribe: api.subscribe, unsubscribe: api.unsubscribe }}>
      {children}
    </MqttContext.Provider>
  );
}
