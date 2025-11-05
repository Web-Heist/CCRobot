// src/context/BotContext.tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { API_BASE } from "../config";

export type Bot = {
  id: string;
  name: string;
  licenseKey?: string;
  connected: boolean; // user linked
  status: "online" | "offline";
  verified?: boolean;
};

type BotContextType = {
  availableBots: Bot[]; // online nearby bots (may include verified or not)
  licensedBots: Bot[];  // verified bots (persisted), show online/offline
  activeBotId: string | null;
  verifyBot: (id: string, licenseKey: string) => Promise<boolean>;
  connectBot: (id: string) => Promise<boolean>;
  disconnectBot: (id: string) => Promise<void>;
  setActiveBot: (id: string) => void;
  removeLicensedBot: (id: string) => Promise<void>;
};

const BotContext = createContext<BotContextType | undefined>(undefined);

export const BotProvider = ({ children }: { children: ReactNode }) => {
  const [allBots, setAllBots] = useState<Bot[]>([]);
  const [activeBotId, setActiveBotId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("activeBot") || null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    localStorage.setItem("activeBot", activeBotId ?? "");
  }, [activeBotId]);

  // Poll backend every 3s
  useEffect(() => {
    let cancelled = false;
    const fetchBots = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/bots`);
        const data: Bot[] = await res.json();
        if (!cancelled) setAllBots(data);
      } catch (err) {
        console.error("Failed to fetch bots:", err);
      }
    };
    fetchBots();
    const id = setInterval(fetchBots, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // available (nearby) = only online bots
  const availableBots = allBots.filter((b) => b.status === "online");

  // licensed/your bots = verified ones (present even if offline)
  const licensedBots = allBots.filter((b) => !!b.verified);

  // verify license key: calls backend endpoint which performs device verification
  const verifyBot = async (id: string, licenseKey: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/bots/${encodeURIComponent(id)}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.warn("verify failed", data);
        return false;
      }
      // refresh bots list
      const refreshed = await fetch(`${API_BASE}/api/bots`).then((r) => r.json());
      setAllBots(refreshed);
      return data.verified === true;
    } catch (err) {
      console.error("verifyBot error", err);
      return false;
    }
  };

  const connectBot = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/bots/${encodeURIComponent(id)}/connect`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.warn("connect failed", err);
        return false;
      }
      const refreshed = await fetch(`${API_BASE}/api/bots`).then((r) => r.json());
      setAllBots(refreshed);
      if (!activeBotId) setActiveBotId(id);
      return true;
    } catch (err) {
      console.error("connectBot error", err);
      return false;
    }
  };

  const disconnectBot = async (id: string) => {
    try {
      await fetch(`${API_BASE}/api/bots/${encodeURIComponent(id)}/disconnect`, { method: "POST" });
      const refreshed = await fetch(`${API_BASE}/api/bots`).then((r) => r.json());
      setAllBots(refreshed);
      if (activeBotId === id) setActiveBotId(null);
    } catch (err) {
      console.error("disconnectBot error", err);
    }
  };

  const removeLicensedBot = async (id: string) => {
    try {
      await fetch(`${API_BASE}/api/bots/${encodeURIComponent(id)}/license`, { method: "DELETE" });
      const refreshed = await fetch(`${API_BASE}/api/bots`).then((r) => r.json());
      setAllBots(refreshed);
      if (activeBotId === id) setActiveBotId(null);
    } catch (err) {
      console.error("removeLicensedBot error", err);
    }
  };

  const setActiveBot = async (id: string) => {
    if (!licensedBots.some((b) => b.id === id)) return;
  
    // Update frontend state immediately
    setActiveBotId(id);
  
    // Call backend to set active
    try {
      const res = await fetch(`${API_BASE}/api/bots/${encodeURIComponent(id)}/active`, {
        method: "POST",
      });
      const data = await res.json();
  
      if (!res.ok) {
        console.warn("Failed to set bot active:", data.error);
        // If backend rejects, reset frontend active state
        setActiveBotId(null);
        return;
      }
  
      // Refresh bots list
      const refreshed = await fetch(`${API_BASE}/api/bots`).then(r => r.json());
      setAllBots(refreshed);
  
      console.log("✅ Bot activated:", id);
    } catch (err) {
      console.error("Failed to set bot active:", err);
      setActiveBotId(null);
    }
  };
  

  return (
    <BotContext.Provider
      value={{
        availableBots,
        licensedBots,
        activeBotId,
        verifyBot,
        connectBot,
        disconnectBot,
        setActiveBot,
        removeLicensedBot,
      }}
    >
      {children}
    </BotContext.Provider>
  );
};

export const useBots = () => {
  const ctx = useContext(BotContext);
  if (!ctx) throw new Error("useBots must be used inside BotProvider");
  return ctx;
};
