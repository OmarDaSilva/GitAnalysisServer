import express from "express";
import multer from "multer";
import AdmZip from "adm-zip";
const upload = multer({ dest: "./repos/" });
const app = express();
const port = 4000;
import cors from "cors";
import gitAnalysis from "./gitAnalysis.js";
import RepoDatesAnalysis from "./gitAnalysis.js"
import eventsEmitter from "./EventEmitter.js";

const corsOptions = {
  origin: "*",
};

app.use(cors(corsOptions));

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.post("/getRepoDeltaDates", upload.single("file"), async (req, res, next) => {
  res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const query = req.body.query;

    switch (query) {
      case query == "uploadRepo":
        return 1;
      case query == "analyseRepoDeltas":
        return 2;
    }

})

app.post("/uploadRepo", upload.single("file"), async (req, res, next) => {
  const { path, originalname } = req.file;
  const token = req.body.token
  const URL = req.body.URL
  
  console.log("File submitted", originalname);
  let zip = new AdmZip(path);
  zip.extractAllTo("repos");
  let pathToRepo = `./repos/${originalname.replace(".zip", "")}`;

  const repoAnalysed = await RepoDatesAnalysis(pathToRepo);
  // const repoAnalysed = await gitAnalysis(pathToRepo);
  res.json(repoAnalysed);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
