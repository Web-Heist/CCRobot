import express from "express";
import { connect } from "mqtt";
import cors from "cors";
import parseCommand from "./nlp.js"; 
import axios from "axios";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 4000;
const MQTT_URL = "mqtt://broker.hivemq.com:1883";

const httpServer = app; // express handles HTTP only


// --- In-memory bot store ---
const bots = new Map();
let latestFrame = null; // video frame storage

// --- MQTT client ---
const mqtt = connect(MQTT_URL);

// Helper: add/update bot
function upsertBot(id, updates) {
  const bot = bots.get(id) || {
    id,
    name: "Unknown",
    verified: false,
    connected: false,
    active: false,
    status: "offline",
    gps: { lat: null, lon: null, updatedAt: null },
  };

  for (const key in updates) {
    if (updates[key] !== undefined) bot[key] = updates[key];
  }

  bot.lastSeen = Date.now();
  bots.set(id, bot);
}

// --- MQTT subscriptions ---
mqtt.on("connect", () => {
  console.log("✅ MQTT connected");
  mqtt.subscribe("bot/announce");
  mqtt.subscribe("bot/+/status");
  mqtt.subscribe("bot/+/verified");
  mqtt.subscribe("bot/+/gps");
  mqtt.subscribe("bot/video");
});

// --- MQTT handler ---
mqtt.on("message", (topic, payload) => {
  try {
    if (topic === "bot/video") {
      latestFrame = payload; // raw bytes (base64 comes from bot)
      return;
    }
    

    const msg = JSON.parse(payload.toString());
    const id = msg.id || topic.split("/")[1];
    if (!id) return;

    if (topic === "bot/announce") {
      const existing = bots.get(id);
      if (existing) return;
      upsertBot(id, { name: msg.name, status: msg.status || "online" });
    } else if (topic.match(/^bot\/.+\/status$/)) {
      upsertBot(id, { name: msg.name, status: msg.status });
    } else if (topic.match(/^bot\/.+\/verified$/)) {
      upsertBot(id, { name: msg.name, verified: msg.verified });
    } else if (topic.match(/^bot\/.+\/gps$/)) {
      const { lat, lon } = msg;
      if (lat !== undefined && lon !== undefined) {
        upsertBot(id, { gps: { lat, lon, updatedAt: Date.now() } });
      }
    }
  } catch (err) {
    console.error("❌ MQTT parse error", err);
  }
});

// --- Periodic cleanup (offline bots) ---
setInterval(() => {
  const now = Date.now();
  for (const [id, bot] of bots.entries()) {
    if (bot.status === "online" && now - bot.lastSeen > 10000) {
      bot.status = "offline";
      bots.set(id, bot);
    }
  }
}, 5000);

// --- REST API ---

// Get all bots
app.get("/api/bots", (req, res) => {
  res.json(Array.from(bots.values()));
});

// Get GPS of all connected bots
app.get("/api/bots/gps", (req, res) => {
  const gpsBots = Array.from(bots.values())
    .filter((bot) => bot.status === "online")
    .map((bot) => ({
      id: bot.id,
      name: bot.name,
      lat: bot.gps?.lat ?? 33.6844,
      lon: bot.gps?.lon ?? 73.0479,
      lastUpdate: bot.gps?.updatedAt ?? bot.lastSeen ?? Date.now(),
    }));

  res.json(gpsBots);
});

// Verify bot license
app.post("/api/bots/:id/verify", async (req, res) => {
  const { id } = req.params;
  const { licenseKey } = req.body;
  if (!bots.has(id)) return res.status(404).json({ error: "Bot not found" });

  mqtt.publish(`bot/${id}/verify`, JSON.stringify({ key: licenseKey }));

  const waitForVerification = () =>
    new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const bot = bots.get(id);
        if (bot && bot.verified) {
          clearInterval(checkInterval);
          resolve(true);
        }
      }, 300);

      setTimeout(() => {
        clearInterval(checkInterval);
        resolve(false);
      }, 3000);
    });

  const verified = await waitForVerification();
  if (verified) {
    const bot = bots.get(id);
    bot.licenseKey = licenseKey;
    bots.set(id, bot);
    return res.json({ verified: true });
  } else {
    return res.status(400).json({ verified: false });
  }
});

// NLP endpoint
app.post("/api/bots/:id/nlp", (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ command: "unknown" });

  try {
    const parsed = parseCommand(text);
    res.json({ command: parsed });
  } catch (err) {
    console.error("❌ NLP error:", err);
    res.status(500).json({ command: "unknown" });
  }
});

// Connect / disconnect bot
app.post("/api/bots/:id/connect", (req, res) => {
  const { id } = req.params;
  const bot = bots.get(id);
  if (!bot) return res.status(404).json({ error: "Not found" });
  if (!bot.verified) return res.status(400).json({ error: "Not verified" });
  if (bot.status !== "online") return res.status(400).json({ error: "Bot offline" });

  bot.connected = true;
  bots.set(id, bot);
  res.json({ connected: true });
});

app.post("/api/bots/:id/disconnect", (req, res) => {
  const { id } = req.params;
  const bot = bots.get(id);
  if (!bot) return res.status(404).json({ error: "Not found" });

  bot.connected = false;
  bot.active = false;
  bots.set(id, bot);
  res.json({ connected: false });
});

// Remove license
app.delete("/api/bots/:id/license", (req, res) => {
  const { id } = req.params;
  const bot = bots.get(id);
  if (!bot) return res.status(404).json({ error: "Not found" });

  bot.verified = false;
  bot.connected = false;
  bot.active = false;
  delete bot.licenseKey;
  bots.set(id, bot);
  res.json({ removed: true });
});

// Set active bot
app.post("/api/bots/:id/active", (req, res) => {
  const { id } = req.params;
  const bot = bots.get(id);
  if (!bot) return res.status(404).json({ error: "Not found" });
  if (!bot.verified || !bot.connected || bot.status !== "online") {
    return res.status(400).json({ error: "Bot not ready to be active" });
  }

  // unset previous active
  for (const [_, b] of bots.entries()) {
    b.active = false;
    bots.set(b.id, b);
  }

  bot.active = true;
  bots.set(id, bot);
  res.json({ active: true, botId: id });
});

// Send commands to active bot using natural language
app.post("/api/bots/:botId/commands", async (req, res) => {
  const { botId } = req.params;
  const { command } = req.body;

  if (!command) return res.status(400).json({ error: "No command provided" });

  try {
    const parsed = parseCommand(command);
    const steps = Array.isArray(parsed) ? parsed : [parsed];

    console.log(`📝 Parsed command(s):`, steps);

    for (const step of steps) {
      if (typeof step === "string" && step.startsWith("wait:")) {
        const delay = parseInt(step.split(":")[1], 10) || 0;
        console.log(`⏳ Waiting ${delay}ms before next command`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        console.log(`📡 Sending to bot ${botId}:`, step);
        mqtt.publish(
          `bot/${botId}/commands`,
          JSON.stringify({ command: step })
        );
      }
    }

    return res.json({ success: true, commands: steps });
  } catch (err) {
    console.error("❌ Error processing command:", err);
    return res.status(500).json({ error: "Server error processing command" });
  }
});



// --- ROS2 integration endpoints ---
const ROS2_URL = "http://localhost:8000";

// Start SLAM
app.post("/api/ros2/start_slam", async (req, res) => {
  try {
    const response = await axios.post(`${ROS2_URL}/ros2/start_slam`);
    res.json(response.data);
  } catch {
    res.status(500).json({ error: "Failed to start SLAM" });
  }
});

// Stop SLAM
app.post("/api/ros2/stop_slam", async (req, res) => {
  try {
    const response = await axios.post(`${ROS2_URL}/ros2/stop_slam`);
    res.json(response.data);
  } catch {
    res.status(500).json({ error: "Failed to stop SLAM" });
  }
});

// Save map
app.post("/api/ros2/save_map", async (req, res) => {
  const { map_name } = req.body;
  try {
    const response = await axios.post(`${ROS2_URL}/ros2/save_map`, { map_name });
    res.json(response.data);
  } catch {
    res.status(500).json({ error: "Failed to save map" });
  }
});

// Start Patrol
app.post("/api/ros2/start_patrol", async (req, res) => {
  try {
    const response = await axios.post(`${ROS2_URL}/ros2/start_patrol`);
    res.json(response.data);
  } catch {
    res.status(500).json({ error: "Failed to start patrol" });
  }
});

// Stop Patrol
app.post("/api/ros2/stop_patrol", async (req, res) => {
  try {
    const response = await axios.post(`${ROS2_URL}/ros2/stop_patrol`);
    res.json(response.data);
  } catch {
    res.status(500).json({ error: "Failed to stop patrol" });
  }
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`🚀 API server running at http://localhost:${PORT}`);
});
