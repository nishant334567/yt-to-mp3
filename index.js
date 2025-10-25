import express from "express";
import cors from "cors";
import { exec } from "child_process";
import { Storage } from "@google-cloud/storage";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import speech from "@google-cloud/speech";

const app = express();
app.use(cors());
app.use(express.json());

const BUCKET_NAME = process.env.BUCKET_NAME || "kavisha_audio_training";

const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || "kavisha-ai-468913"
});

const client = new speech.SpeechClient();

app.get("/save-audio", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing YouTube URL" });

  const filename = `${uuidv4()}.mp3`;
  const localPath = `/tmp/${filename}`;
  const cookiePath = `/app/cookies.txt`;
  const cmd = `yt-dlp -x --audio-format mp3 --audio-quality 0 --cookies ${cookiePath} -o ${localPath} ${url}`;

  try {
    await new Promise((resolve, reject) => {
      exec(cmd, (error, stdout, stderr) => {
        if (error) reject(stderr || error);
        else resolve(stdout);
      });
    });

    // Upload to GCP and clean up immediately
    await storage.bucket(BUCKET_NAME).upload(localPath, { destination: filename });
    
    // Clean up local file immediately to free memory
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
    }
    
    // Start speech recognition
    try {
      let uri = `gs://${BUCKET_NAME}/${filename}`;
      const [operation] = await client.longRunningRecognize({
        audio: { uri },
        config: {
          encoding: "MP3",
          sampleRateHertz: 22050, // Reduced sample rate to save memory
          languageCode: "en-US",
          alternativeLanguageCodes: ["en-IN"],
          enableAutomaticPunctuation: true,
          enableWordTimeOffsets: true, // Disabled to save memory
// Disabled to save memory
          model: "latest_long",
          useEnhanced: true, 
          diarizationConfig: {
            enableSpeakerDiarization: true,
            diarizationSpeakerCount: 2,
          },
         
        },
      });
      
      res.json({
        success: true,
        jobId: operation.name,
        message: "Transcription Started",
        file: `gs://${BUCKET_NAME}/${filename}`
      });
    } catch (speechError) {
      // If speech recognition fails, still return success for upload
      res.json({
        success: true,
        message: "Uploaded successfully, but transcription failed",
        file: `gs://${BUCKET_NAME}/${filename}`,
        error: speechError.message
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.toString() });
  }
});

// Status API to check transcription job progress
app.get("/status", async (req, res) => {
  const { jobid } = req.query;

  if (!jobid) {
    return res.status(400).json({ error: "Missing jobid" });
  }

  try {
    const operation = await client.checkLongRunningRecognizeProgress(jobid);
    
    if (!operation.done) {
      return res.json({ status: "processing" });
    }

    if (operation.error) {
      return res.json({ status: "error", error: operation.error.message });
    }

    // Process speaker diarization
    let transcription = "";
    if (operation.result.results && operation.result.results.length > 0) {
      const segments = [];
      
      operation.result.results.forEach((result) => {
        const transcript = result.alternatives[0].transcript;
        
        // Check if we have word-level speaker tags
        if (result.words && result.words.length > 0) {
          // Group words by speaker
          const speakerGroups = {};
          
          result.words.forEach((word) => {
            const speakerTag = word.speakerTag || 0;
            if (!speakerGroups[speakerTag]) {
              speakerGroups[speakerTag] = [];
            }
            speakerGroups[speakerTag].push(word.word);
          });
          
          // Create speaker segments
          Object.keys(speakerGroups).forEach((speakerTag) => {
            const speakerText = speakerGroups[speakerTag].join(' ');
            segments.push(`Speaker ${parseInt(speakerTag) + 1}: ${speakerText}`);
          });
        } else {
          // Fallback if no speaker info
          segments.push(transcript);
        }
      });
      
      transcription = segments.join('\n\n');
    }
      
    return res.json({ 
      status: "done", 
      transcription: transcription 
    });
  } catch (error) {
    console.error("Transcription check error:", error);
    return res.status(500).json({ 
      status: "error", 
      error: error.message 
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
