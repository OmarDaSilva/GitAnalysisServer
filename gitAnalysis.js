import NodeGit from "nodegit";
import eventsEmitter from "./EventEmitter.js";
import fs from "fs";
import path from "path";

/*
      node colors:
      Dark blue - Directories
      Light blue - files
      Grey - contributors
    */
var darkblue = "darkblue";
var lightBlue = "lightblue";
var grey = "grey";

export default async function gitAnalysis(repoFilepath, branchName) {
  const repo = await NodeGit.Repository.open(repoFilepath);
  const branches = await getAllBranches(repo);

  const branch = branchName
    ? await repo.getBranch(branchName)
    : await repo.getBranch(branches.main);

  const repoData = await composeJSONFile(repo, branch);
}

async function getAllBranches(repo) {
  const refs = await repo.getReferences();
  const mainOrMaster = [
    refs.find(
      (branches) =>
        branches.name().includes("main") || branches.name().includes("master")
    ),
  ];

  return {
    branches: refs,
    main: mainOrMaster[0],
  };
}

async function composeJSONFile(repo, branch) {
  const headCommit = await repo.getBranchCommit(branch);

  const revWalk = repo.createRevWalk();
  revWalk.sorting(NodeGit.Revwalk.SORT.REVERSE);
  revWalk.push(headCommit.id());

  const commits = await revWalk.getCommitsUntil((_commit) => true);
  await composeData(commits);
}

async function processCommit(commit, cb, commitsByDay) {
  const commitDate = new Date(commit.date());
  // Reset the time to midnight to group by day
  commitDate.setHours(0, 0, 0, 0);
  const dateString = commitDate.toISOString();

  // Get Authors name
  const authorName = commit.committer().name();

  if (commitsByDay[dateString] == undefined) {
    commitsByDay[dateString] = {
      contributors: {},
      repoState: {},
    };
  }

  if (commitsByDay[dateString].contributors[authorName] == undefined) {
    commitsByDay[dateString].contributors[authorName] = {
      filesChanged: {},
    };
  }

  const diffArray = await commit.getDiff();
  if (diffArray.length == 1) {
    const diff = diffArray[0];
    const patches = await diff.patches();
    for (const patch of patches) {
      const newFile = patch.newFile().path();

      if (newFile) {
        commitsByDay[dateString].contributors[authorName].filesChanged[
          newFile
        ] = {
          isModified: patch.isModified(),
          isAdded: patch.isAdded(),
          isDeleted: patch.isDeleted(),
          isRenamed: patch.isRenamed(),
          lineStats: patch.lineStats(),
        };
      }
    }
  }

  /* 
  //     This function below gets the current state of the Repo using the branch and commit,
  //     it updates the state of the repo state on every commit, this is because we don't know
  //     if the next commit will be the next day or not and that requires retriving the next commit.
  //     it doesn't seem it's performance efficient but I haven't seen any siginifcant performance impact,
  //     However, for potentially large repos this could be observed
  //   */

  let currentCommitTreeEntires = await commit.getTree();
  let filenames = await currentCommitTreeEntires.entries();

  filenames.forEach(async (entry) => {
    if (commitsByDay[dateString].repoState[entry.path()] == undefined) {
      if (entry.isFile()) {
        commitsByDay[dateString].repoState[entry.path()] = {
          entryName: "./" + entry.path(),
          isDirectory: false,
          children: null,
          colour: lightBlue,
        };
      } else {
        commitsByDay[dateString].repoState[entry.path()] = {
          entryName: "./" + entry.path(),
          isDirectory: true,
          children: await getDirectoryEntries(entry),
          colour: darkblue,
        };
      }
    }
  });

  cb();
}

async function composeData(commits) {
  var commitsByDay = {};

  let dataProcessor = commits.reduce((promiseChain, item) => {
    return promiseChain.then(
      () =>
        new Promise((resolve) => {
          processCommit(item, resolve, commitsByDay);
        })
    );
  }, Promise.resolve());

  dataProcessor.then(() => generateJSONFile(commitsByDay));
}

function generateJSONFile(data) {
  /* 
    We don't want to recreate a file if it already exists, there was
    observed instances of commitsByDay being returned twice
  */

  const folderPath = "/GeneratedJSON";
  const fileName = "data.json";

  const checkFilePath = path.join(folderPath, fileName);
  fs.access(checkFilePath, fs.constants.F_OK, (err) => {
    if (err) {
      // lets generate the json file
    } else {
      // send existing json file to client
    }
  });

  const cleanData = dataFormatter(data);
  eventsEmitter.emit("FileGenerated", jsonString);

  // Just send this string to the client
  // const jsonString = JSON.stringify(data);
  // const dirPath = path.join("./GeneratedJSON", "data");

  // if (!fs.existsSync(dirPath)) {
  //   fs.mkdirSync(dirPath);
  // }

  // const filePath = path.join(dirPath, "data.json");

  // fs.writeFileSync(filePath, jsonString, "utf8", (err) => {
  //   if (err) {
  //     console.error(err);
  //     return;
  //   }
  // });
}

function dataFormatter(data) {
  const dataFormatted = {};

  const dates = Object.keys(data);

  dates.forEach((date) => {
    dataFormatted[date] = {
      nodes: [{ id: "root", group: 1, colour: "red" }],
      links: [],
    };

    const repoState = data[date].repoState;

    let currentTarget = "root";
    // let group = 2;

    traverseNodeLeafes(repoState, dataFormatted[date], currentTarget);
    // for (const [pathName, value] of Object.entries(repoState)) {
    //   if (!value.isDirectory) {
    //     let node = {
    //       id: pathName,
    //       group: group,
    //       colour: lightBlue,
    //     };
    //     let link = {
    //       source: pathName,
    //       target: currentTarget,
    //       value: 1,
    //     };
    //     dataFormatted[date].nodes.push(node);
    //     dataFormatted[date].links.push(link);
    //   } else {
    //     let node = {
    //       id: pathName,
    //       group: group,
    //       colour: darkblue,
    //     };
    //     let link = {
    //       source: pathName,
    //       target: currentTarget,
    //       value: 1,
    //     };
    //     dataFormatted[date].nodes.push(node);
    //     dataFormatted[date].links.push(link);
    //     traverseNodeLeafes(value.children, dataFormatted[date], pathName);
    //   }
    // }
  });

  console.log(data);
}

function traverseNodeLeafes(children, dataStore, parentNodePath) {
  let newGroupNumber = Math.floor(Math.random() * (1000 - 1 + 1)) + 1;
  for (const [pathName, value] of Object.entries(children)) {
    if (!value.isDirectory) {
      let node = {
        id: pathName,
        group: newGroupNumber,
        colour: lightBlue,
      };
      let link = {
        source: pathName,
        target: parentNodePath,
        value: 1,
      };
      dataStore.nodes.push(node);
      dataStore.links.push(link);
    } else {
      let node = {
        id: pathName,
        group: newGroupNumber,
        colour: darkblue,
      };
      let link = {
        source: pathName,
        target: parentNodePath,
        value: 1,
      };
      dataStore.nodes.push(node);
      dataStore.links.push(link);
      traverseNodeLeafes(value.children, dataStore, pathName);
    }
  }
}

async function getDirectoryEntries(entry) {
  const files = {};
  const directoryTree = await entry.getTree();
  const directoryEntries = directoryTree.entries();
  directoryEntries.forEach(async (entry) => {
    if (!entry.isFile()) {
      files[entry.path()] = {
        entryName: entry.path(),
        isDirectory: true,
        children: await getDirectoryEntries(entry),
        colour: darkblue,
      };
    } else {
      files[entry.path()] = {
        entryName: entry.path(),
        isDirectory: false,
        children: null,
        colour: lightBlue,
      };
    }
  });

  return files;
}
