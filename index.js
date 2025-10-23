import express from "express";
import { exec } from "child_process";
import { Storage } from "@google-cloud/storage";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";

const app = express();
app.use(express.json());

const BUCKET_NAME = process.env.BUCKET_NAME || "kavisha_audio_training";

const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || "kavisha-ai-468913"
});

app.get("/save-audio", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing YouTube URL" });

  const filename = `${uuidv4()}.mp3`;
  const localPath = `/tmp/${filename}`;
  const cmd = `yt-dlp -x --audio-format mp3 --cookies cookies.txt -o ${localPath} ${url}`;

  try {
    await new Promise((resolve, reject) => {
      exec(cmd, (error, stdout, stderr) => {
        if (error) reject(stderr || error);
        else resolve(stdout);
      });
    });

    await storage.bucket(BUCKET_NAME).upload(localPath, { destination: filename });
    fs.unlinkSync(localPath);

    res.json({ message: "Uploaded", file: `gs://${BUCKET_NAME}/${filename}` });
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

app.listen(8080, () => console.log("Server running on port 8080"));
