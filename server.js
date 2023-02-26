import express from "express";
import multer from "multer";
import AdmZip from "adm-zip";
const upload = multer({ dest: "./repos/" });
const app = express();
const port = 4000;
import cors from "cors";
import gitAnalysis from "./gitAnalysis.js";
import eventsEmitter from "./EventEmitter.js";

const corsOptions = {
  origin: "*",
};

app.use(cors(corsOptions));

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.post("/uploadRepo", upload.single("file"), async (req, res, next) => {
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders(); // flush the headers to establish SSE with client

  const { path, originalname } = req.file;
  console.log("File submitted", originalname);
  let zip = new AdmZip(path);
  zip.extractAllTo("repos");
  let pathToRepo = `./repos/${originalname.replace(".zip", "")}`;

  gitAnalysis(pathToRepo);

  eventsEmitter.on("FileComposed", (file) => {
    console.log("File Composed event!", file);
  });

  res.on("close", () => {
    console.log("client dropped me");
    res.end();
  });
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
