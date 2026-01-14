import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { connect } from "mqtt";
import cors from "cors";
import parseCommand from "./nlp.js"; 
import axios from "axios";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 4000;
const MQTT_URL = "mqtt://broker.hivemq.com:1883";

// Create HTTP server and attach Socket.IO for WebSocket transport
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: ["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 1e7, // 10MB for large frames
  allowEIO3: true, // Allow Engine.IO v3 clients
});

// Enable binary handling
io.engine.on("connection", (socket) => {
  socket.binaryType = "arraybuffer";
});


// --- In-memory bot store ---
const bots = new Map();
let latestFrame = null; // video frame storage (binary JPEG)

// --- MQTT client ---
const mqtt = connect(MQTT_URL, {
  keepalive: 60,        // Send ping every 60s
  reconnectPeriod: 1000, // Retry every 1s
  connectTimeout: 30000, // 30s timeout
  clean: true,
});

mqtt.on("reconnect", () => {
  console.log("♻️ MQTT reconnecting...");
});

mqtt.on("offline", () => {
  console.error("❌ MQTT went offline!");
});


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
  console.log("✅ MQTT connected to", MQTT_URL);
  mqtt.subscribe("bot/announce");
  mqtt.subscribe("bot/+/status");
  mqtt.subscribe("bot/+/verified");
  mqtt.subscribe("bot/+/gps");
  mqtt.subscribe("bot/video");
});

mqtt.on("error", (err) => {
  console.error("❌ MQTT error:", err);
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

// --- WebSocket (Socket.IO) video bridge ---
// Rooms: "viewers" receive frames. Publishers emit frames.
// Events:
//  - from publisher: "video:frame" (binary JPEG Buffer)
//  - from publisher: "video:camera_info" (JSON CameraInfo-like)
//  - to viewers: "video:frame" (binary JPEG Buffer)
const RAW_TOPIC = "camera/image_raw";
const INFO_TOPIC = "camera/camera_info";

io.on("connection", (socket) => {
  const role = socket.handshake.query?.role;
  console.log(`🔌 WS connected id=${socket.id} role=${role || "unknown"}`);

  if (role === "viewer") {
    socket.join("viewers");
    // On new viewer, optionally push the latest frame for immediate display
    if (latestFrame) {
      socket.emit("video:frame", latestFrame);
    }
  }

  // Simplified video:frame handler in server.js
socket.on("video:frame", (data) => {
  // ✅ SIMPLIFIED: Handle all cases uniformly
  let frameBuffer;
  
  if (Buffer.isBuffer(data)) {
    frameBuffer = data;
  } else if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
    frameBuffer = Buffer.from(data);
  } else {
    console.warn("⚠️ Unknown frame data type");
    return;
  }

  // Validate JPEG magic bytes
  if (frameBuffer.length < 2 || frameBuffer[0] !== 0xFF || frameBuffer[1] !== 0xD8) {
    console.warn("⚠️ Invalid JPEG data");
    return;
  }

  // Store latest frame
  latestFrame = frameBuffer;

  // ✅ EFFICIENT: Single emit to viewers (no conversion needed)
  io.to("viewers").emit("video:frame", frameBuffer);

  // ✅ EFFICIENT: Single MQTT publish (no conversion needed)
  if (mqtt.connected) {
    mqtt.publish(RAW_TOPIC, frameBuffer, { qos: 0 });
  }
});
    
  socket.on("video:camera_info", (info) => {
    try {
      const payload = Buffer.from(JSON.stringify(info));
      if (mqtt.connected) {
        mqtt.publish(INFO_TOPIC, payload, { qos: 0, retain: true }, (err) => {
          if (err) {
            console.error("❌ MQTT camera_info publish error:", err);
          } else {
            console.log(`✅ Published camera_info to MQTT ${INFO_TOPIC}`);
          }
        });
      } else {
        console.warn("⚠️ MQTT not connected, skipping camera_info publish");
      }
    } catch (e) {
      console.error("❌ Error handling video:camera_info", e);
    }
  });

  socket.on("disconnect", () => {
    console.log(`🔌 WS disconnected id=${socket.id}`);
  });
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
httpServer.listen(PORT, () => {
  console.log(`🚀 API/WS server running at http://localhost:${PORT}`);
});
