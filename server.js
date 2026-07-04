import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { startVideoStream, stopVideoStream, skipVideoStream, pauseVideoStream, resumeVideoStream, isPlaying, streamErrors } from "./streamService.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Sajikan folder public agar Puppeteer bisa membuka player.html
app.use(express.static("public"));

// Proxy untuk subtitle (bypassing CORS)
app.get("/proxy-sub", async (req, res) => {
  try {
    const subUrl = req.query.url;
    if (!subUrl) return res.status(400).send("No subtitle URL provided");
    const response = await fetch(subUrl);
    const text = await response.text();
    let vttText = text;
    if (!text.trim().startsWith("WEBVTT")) {
        vttText = "WEBVTT\n\n" + text
            .replace(/\r\n|\r/g, '\n')
            .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2'); // Ubah koma jadi titik di timestamp SRT
    }
    
    res.setHeader("Content-Type", "text/vtt; charset=utf-8");
    res.send(vttText);
  } catch (err) {
    res.status(500).send("Error fetching subtitle: " + err.message);
  }
});

const PORT = process.env.PORT || 3333;
const API_KEY = process.env.API_KEY || "RAHASIA_KITA"; // default api key

// Middleware untuk mengecek API Key
const authMiddleware = (req, res, next) => {
  const token = req.headers['authorization'];
  if (token !== `Bearer ${API_KEY}`) {
    return res.status(403).json({ error: "Forbidden: Invalid API Key" });
  }
  next();
};

app.post("/api/stream/start", authMiddleware, async (req, res) => {
  const { guildId, channelId, videoUrl, title, subtitleUrl } = req.body;

  if (!guildId || !channelId || !videoUrl) {
    return res.status(400).json({ error: "Missing required fields: guildId, channelId, videoUrl" });
  }

  try {
    // Jalankan tanpa menunggu selesai agar API langsung merespons
    startVideoStream(guildId, channelId, videoUrl, title, subtitleUrl).catch(console.error);
    return res.json({ success: true, message: `Streaming ${title || 'video'} in channel ${channelId}` });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/stream/stop", authMiddleware, async (req, res) => {
  const { guildId } = req.body;
  if (!guildId) return res.status(400).json({ error: "Missing guildId" });

  try {
    await stopVideoStream(guildId);
    return res.json({ success: true, message: "Stream stopped." });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/stream/skip", authMiddleware, async (req, res) => {
  const { guildId } = req.body;
  if (!guildId) return res.status(400).json({ error: "Missing guildId" });

  try {
    const skipped = await skipVideoStream(guildId);
    return res.json({ success: true, message: skipped ? "Stream skipped." : "No active stream to skip." });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/stream/pause", authMiddleware, async (req, res) => {
  const { guildId } = req.body;
  if (!guildId) return res.status(400).json({ error: "Missing guildId" });

  try {
    const paused = await pauseVideoStream(guildId);
    return res.json({ success: true, message: paused ? "Stream paused." : "Cannot pause." });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/stream/resume", authMiddleware, async (req, res) => {
  const { guildId } = req.body;
  if (!guildId) return res.status(400).json({ error: "Missing guildId" });

  try {
    const resumed = await resumeVideoStream(guildId);
    return res.json({ success: true, message: resumed ? "Stream resumed." : "Cannot resume." });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/stream/status", authMiddleware, (req, res) => {
  const guildId = req.query.guildId;
  if (!guildId) return res.status(400).json({ error: "Missing guildId query parameter" });
  
  const errorMsg = streamErrors.get(guildId) || null;
  // Hapus error setelah dibaca agar tidak terus terbaca
  if (errorMsg) streamErrors.delete(guildId);

  res.json({ 
    isPlaying: isPlaying.get(guildId) || false,
    error: errorMsg
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎬 Stream Worker Bot is running on http://0.0.0.0:${PORT}`);
  console.log(`🔐 API Key: ${API_KEY}`);
});
