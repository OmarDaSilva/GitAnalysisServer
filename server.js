import express from "express";
import multer from "multer";
const upload = multer({ dest: "./repos/" });
const app = express();
const port = 4000;
import cors from "cors";
import eventsEmitter from "./EventEmitter.js";
import { RepoDatesAnalysis, gitAnalysis } from "./gitAnalysis.js";
import fse from "fs-extra/esm";

const corsOptions = {
  origin: "*",
};

app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.post(
  "/getRepoDeltaDates",
  async (req, res, next) => {
    const dates = req.body.deltaDates;
    const username = req.body.userName;
    const URL = req.body.url;
    const branch = req.body.branch;
    const accessToken = req.body.accessToken;

    const repoAnalysed = await gitAnalysis(
      URL,
      branch,
      dates,
      accessToken,
      username
    );
    res.write(JSON.stringify(repoAnalysed));
    res.end();
  }
);

app.post("/uploadRepo", async (req, res, next) => {
  const beforeUsage = process.memoryUsage();

  // process the request data
  // ...

  // end monitoring memory usage after processing data

  // calculate memory usage delta



  const sshKey = req.body.sshKey
  const URL = req.body.url;
  const repoName = req.body.repoName;
  const userName = req.body.userName ?? null;
  const branch = req.body.branch ?? null
  console.log('test X');
  const repoAnalysed = await RepoDatesAnalysis(URL, sshKey, repoName, userName, branch);

  res.send(JSON.stringify(repoAnalysed));
  const afterUsage = process.memoryUsage();

  const usageDelta = {
    rss: afterUsage.rss - beforeUsage.rss,
    heapTotal: afterUsage.heapTotal - beforeUsage.heapTotal,
    heapUsed: afterUsage.heapUsed - beforeUsage.heapUsed,
    external: afterUsage.external - beforeUsage.external,
  };
  console.log('Memory usage during request:', usageDelta);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

app.on("error", async () => {
  await fse
    .emptyDir("./repos")
    .then(() => {
      console.log("Directory emptied successfully!");
    })
    .catch(() => {
      console.error("Error emptying directory, restart server:", err);
    });
});
