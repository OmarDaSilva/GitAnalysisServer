const express = require("express");
const gitAnalysis = require("./gitAnalysis");
const multer = require("multer");
const AdmZip = require("adm-zip");
const upload = multer({ dest: "./repos/" });
const app = express();
const port = 4000;
const cors = require("cors");

const corsOptions = {
  origin: "*",
};

app.use(cors(corsOptions));

app.get("/", (req, res) => {
  res.send("Hello World!");
});

var server = app.post("/uploadRepo", upload.single("file"), async (req, res, next) => {
  const { path, originalname } = req.file;
  console.log("File submitted", originalname);
  let zip = new AdmZip(path)
  zip.extractAllTo("repos");
  let pathToRepo = require("path").resolve(
    `./repos/${originalname.replace(".zip", "")}`
  );

  gitAnalysis(pathToRepo)
    
  res.send('Ok!')
});

server.on('FileComposed', () => {
  console.log('FileComposed');
})


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
