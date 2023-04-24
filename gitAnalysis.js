import NodeGit from "nodegit";
import { v4 as uuidv4 } from "uuid";
import fse from "fs-extra/esm";
import timeBetween from "./src/utils/TimeBetween.js";
import { exec } from "child_process";
import util from "util";
import getNameFromURL from "./src/utils/getNameFromURL.js";
import getFileExtension from './src/utils/getFileExtension.js'
import colourFilePicker from "./src/utils/colourFilePicker.js";
import { debug, log } from "console";

/*
      node colors:
      Dark blue - Directories
      Light blue - files
      Grey - contributors
*/

var darkblue = "DarkBlue";
// var lightBlue = "lightblue";
var grey = "Grey";
var globalRepo = null;

var localPath = "./repos";
var config;
// var execPromise = util.promisify(exec);
//
export async function RepoDatesAnalysis(
  repositoryUrl,
  accessToken = null,
  sshKey = null,
  userName = null,
  branch = null
) {
  try {
    const execPromise = util.promisify(exec);
    const { stdout, stderr, success } = await execPromise(
      `git clone --bare --progress ${repositoryUrl} ${localPath}`
    );
    const repo = await NodeGit.Repository.open("./repos");
    console.log("test1");
    const branches = await getAllBranches(repo);
    console.log("test 2");
    let useBranch = branch == null ? branches.main : branch;
    console.log(useBranch);
    // const branch = await repo.getBranch(branches.main)
    const repoData = await getRepoCommitDates(repo, useBranch);
    const repoName = getNameFromURL(repositoryUrl);

    return {
      repoName: repoName,
      dates: repoData,
      branches: branches.branches,
      main: branches.main,
    };
  } catch (err) {
    fse
      .emptyDir(localPath)
      .then(() => {
        console.log("Directory emptied successfully!");
      })
      .catch((error) => {
        console.error("Error emptying directory, restart server:", error);
      });
  } finally {
    fse
      .emptyDir(localPath)
      .then(() => {
        console.log("Directory emptied successfully!");
      })
      .catch(() => {
        console.error("Error emptying directory, restart server:", err);
      });
  }
}

export async function gitAnalysis(
  repositoryUrl,
  branchName = null,
  config = null,
  selectedDates
) {
  try {
    const execPromise = util.promisify(exec);
    const { stdout, stderr, success } = await execPromise(
      `git clone --bare --progress ${repositoryUrl} ${localPath}`
    );
    const repo = await NodeGit.Repository.open("./repos");
    globalRepo = repo;

    const repoData = await analysis(repo, branchName, config, selectedDates);

    return {
      repoDates: repoData,
      repoUrl: repositoryUrl,
    };
  } catch (error) {
    await fse
      .emptyDir("./repos")
      .then(() => {
        console.log("Directory emptied successfully!");
      })
      .catch(() => {
        console.error("Error emptying directory, restart server:", err);
      });
    console.log("Error analysing repository: ", error);
  } finally {
    await fse
      .emptyDir("./repos")
      .then(() => {
        console.log("Directory emptied successfully!");
      })
      .catch(() => {
        console.error("Error emptying directory, restart server:", err);
      });
  }
}

async function getRepoCommitDates(repo, branch) {
  const headCommit = await repo.getBranchCommit(branch);

  const revWalk = await repo.createRevWalk();
  revWalk.sorting(NodeGit.Revwalk.SORT.REVERSE);
  revWalk.push(headCommit.id());

  const commits = await revWalk.getCommitsUntil((_commit) => true);

  var commitsByDay = {};
  await commits.reduce((promiseChain, item) => {
    return promiseChain.then(
      () =>
        new Promise((resolve) => {
          getCommitDates(item, resolve, commitsByDay);
        })
    );
  }, Promise.resolve());

  return commitsByDay;
}

async function getCommitDates(commit, cb, commitsByDay) {
  const commitDate = new Date(commit.date());
  // Reset the time to midnight to group by day
  commitDate.setHours(0, 0, 0, 0);
  const dateString = commitDate.toISOString();
  let count = 0;
  if (commitsByDay[dateString] == undefined) {
    commitsByDay[dateString] = {
      indx: count++,
    };
  }

  cb();
}

async function getAllBranches(repo) {
  const refs = await repo.getReferences();
  const mainOrMaster = [
    refs.find(
      (branches) =>
        branches.name().includes("main") || branches.name().includes("master")
    ),
  ];

  if (mainOrMaster[0] == undefined) {
    let branches = refs
      .map((branch) => branch.name())
      .filter((branchName) => !branchName.startsWith("refs/tags"));
    return {
      branches: refs
        .map((branch) => branch.name())
        .filter((branchName) => !branchName.startsWith("refs/tags")),
      main: branches[0],
    };
  } else {
    return {
      branches: refs
        .map((branch) => branch.name())
        .filter((branchName) => !branchName.startsWith("refs/tags")),
      main: mainOrMaster[0].name(),
    };
  }
}

async function analysis(repo, branch, config, selectedDates) {
  const headCommit = await repo.getBranchCommit(branch);
  const revWalk = repo.createRevWalk();
  revWalk.sorting(NodeGit.Revwalk.SORT.REVERSE);
  revWalk.push(headCommit.id());

  // set _commit => true as this will get every commit
  const commits = await revWalk.getCommitsUntil((_commit) => true);
  let cleanData = await composeData(commits, config, selectedDates);

  return cleanData;
}

async function processCommit(
  commit,
  cb,
  commitsByDay,
  config,
  significantEvents,
  fileIndex,
  selectedDates
) {
  const commitDate = new Date(commit.date());
  // Reset the time to midnight to group by day
  commitDate.setHours(0, 0, 0, 0);

  const dateString = commitDate.toISOString();


  // check commit is between/at selected time delta
  if (selectedDates.includes(dateString)) {
    // Get Authors name
    const authorName = commit.committer().name();

    // check if the commit day key exists
    if (commitsByDay[dateString] == undefined) {
      commitsByDay[dateString] = {
        contributors: {},
        repoState: {},
        commitShas: [],
        stats: {
          totalAddedCodeLines: 0,
          totalRemovedCodeLines: 0,
          totalDeleted: 0,
          totalRenames: 0,
          totalNewAddedFiles: 0,
          totalModified: 0,
        },
      };
    }
    // check if author exists for that specific day

    if (config?.includeContributors != null) {
      if (
        commitsByDay[dateString].contributors[authorName] == undefined &&
        config.includeContributors.includes(authorName)
      ) {
        commitsByDay[dateString].contributors[authorName] = {
          filesChanged: {},
        };
      }
    }

    // log commit sha
    let commitSha = commit.id();
    commitSha = commitSha.toString().slice(0, 7);


    if (
      config?.significantEvents &&
      config?.significantEvents[commitSha] != undefined
    ) {
      if (significantEvents[dateString] == undefined) {
        significantEvents[dateString] = {
          events: [
            {
              eventLabel: config.significantEvents[commitSha].eventLabel,
              eventComment: config.significantEvents[commitSha].eventComment,
            },
          ],
        };
      } else {
        significantEvents[dateString].events.push({
          eventLabel: config.significantEvents[commitSha].eventLabel,
          eventComment: config.significantEvents[commitSha].eventComment,
        });
      }
    }

    let commitTimeLineObject = {
      commitSha: commitSha,
      authorName: authorName,
      message: commit.message()
    }
    commitsByDay[dateString].commitShas.push(commitTimeLineObject);

    // Get the files that have changed
    const diffArray = await commit.getDiff();
    if (diffArray.length == 1) {
      const diff = diffArray[0];
      const patches = await diff.patches();
      for (const patch of patches) {
        const newFile = patch.newFile().path();
        let patchesStats = patch.lineStats()

        commitsByDay[dateString].stats.totalAddedCodeLines = commitsByDay[dateString].stats.totalAddedCodeLines + patchesStats.total_additions
        commitsByDay[dateString].stats.totalRemovedCodeLines = commitsByDay[dateString].stats.totalRemovedCodeLines + patchesStats.total_deletions
        
        commitsByDay[dateString].stats.totalDeleted = commitsByDay[dateString].stats.totalDeleted + (patch.isDeleted() ? 1 : 0)
        commitsByDay[dateString].stats.totalRenames = commitsByDay[dateString].stats.totalRenames + (patch.isRenamed() ? 1 : 0)
        commitsByDay[dateString].stats.totalNewAddedFiles = commitsByDay[dateString].stats.totalNewAddedFiles + (patch.isAdded() ? 1: 0)
        commitsByDay[dateString].stats.totalModified = commitsByDay[dateString].stats.totalModified + (patch.isModified() ? 1 : 0)

        if (newFile && config?.includeContributors) {
          if (config?.includeContributors?.includes(authorName)) {

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
    }

    /* 
      This function below gets the current state of the Repo using the branch and commit,
      it updates the state of the repo state on every commit, this is because we don't know
      if the next commit will be the next day or not and that requires retriving the next commit.
      it definitely not performance efficient but I haven't seen any siginifcant performance impact,
      However, for potentially large repos this could be observed. 
    */

    let currentCommitTreeEntires = await commit.getTree();
    let filenames = await currentCommitTreeEntires.entries();

    for (const entry of filenames) {
      if (commitsByDay[dateString].repoState[entry.path()] == undefined) {
        if (entry.isFile()) {
          commitsByDay[dateString].repoState[entry.path()] = {
            entryName: "./" + entry.path(),
            isDirectory: false,
            children: null,
            colour: "Red", // root
          };
        } else {
          let entryName = entry.path();
          if (config?.excludeDirectories) {
            if (!config?.excludeDirectories.includes(entryName)) {
              commitsByDay[dateString].repoState[entry.path()] = {
                entryName: entryName,
                isDirectory: true,
                children: await getDirectoryEntries(entry, fileIndex),
                colour: "Red", // root
              };
            }
          } else {
            commitsByDay[dateString].repoState[entry.path()] = {
              entryName: entryName,
              isDirectory: true,
              children: await getDirectoryEntries(entry, fileIndex),
              colour: "Red", // root
            };
          }
        }
      }
    };
  }

  cb();
}

async function composeData(commits, config, selectedDates) {
  var commitsByDay = {};
  var significantEvents = {};
  let fileIndex = {}

  try {
    let con = config;
    let dataProcessor = commits.reduce((promiseChain, item) => {
      return promiseChain.then(
        () =>
          new Promise((resolve) => {
            processCommit(
              item,
              resolve,
              commitsByDay,
              con,
              significantEvents,
              fileIndex, // Move fileIndex up
              selectedDates // Move selectedDates down
            );
          })
      );
    }, Promise.resolve());

    const cleanData = await dataProcessor.then(() =>
      dataFormatter(commitsByDay, fileIndex)
    );
    return { cleanData, commitsByDay, significantEvents, fileIndex };
  } catch (error) {
    console.log(error);
  }
}

function dataFormatter(data, fileIndex) {
  const dataFormatted = {};
  // let fileIndex = {}


  const dates = Object.keys(data);

  dates.forEach((date) => {
    dataFormatted[date] = {
      nodes: [{ id: "root", group: 1, colour: "Red", name: "root" }],
      links: [],
    };

    fileIndex[date] = {}


    const repoState = data[date].repoState;
    const repoStateContributors = data[date].contributors;
    let currentTarget = "root";

    traverseNodeLeafes(
      repoState,
      dataFormatted[date],
      currentTarget,
      repoStateContributors,
      fileIndex[date]
    );
  });

  return { dataFormatted, fileIndex };
}

function traverseNodeLeafes(
  children,
  dataStore,
  parentNodePath,
  repoStateContributors,
  fileIndex
) {

  let newGroupNumber = Math.floor(Math.random() * (1000 - 1 + 1)) + 1;
  for (const [pathName, value] of Object.entries(children)) {
    // set file colour
    
    if (!value.isDirectory) {
      let fileExtension = getFileExtension(pathName)
      let index = null
      if (fileIndex[fileExtension] === undefined) {
        let indexOfExtension = Object.keys(fileIndex).length;
        index = indexOfExtension
        fileIndex[fileExtension] = {
          indexOfExtension: indexOfExtension,
          totalNumber: 1
        };
      } else {
        index = fileIndex[fileExtension].indexOfExtension
        fileIndex[fileExtension].totalNumber = fileIndex[fileExtension].totalNumber + 1;
      }

      let node = {
        id: pathName,
        name: pathName,
        group: newGroupNumber,
        colour: index !== undefined && index !== null ? colourFilePicker(index) : 'Black'
      };
      let link = {
        source: pathName,
        target: parentNodePath,
        value: 1,
      };
      dataStore.nodes.push(node);
      dataStore.links.push(link);
      traverseContributions(repoStateContributors, pathName, dataStore);
    } else {
      let node = {
        id: pathName,
        name: pathName,
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
      traverseNodeLeafes(
        value.children,
        dataStore,
        pathName,
        repoStateContributors,
        fileIndex
      );
    }
  }
}

function traverseContributions(
  repoStateContributors,
  parentPathName,
  dataStore
) {
  let newGroupNumber = Math.floor(Math.random() * (1000 - 1 + 1)) + 1;
  if (repoStateContributors != undefined) {
    for (const contributor of Object.keys(repoStateContributors)) {
      if (
        repoStateContributors[contributor].filesChanged[parentPathName] !=
        undefined
      ) {
        let uuid = uuidv4();
        let contributorNode = {
          id: `${contributor}-${uuid}`,
          name: contributor,
          group: newGroupNumber,
          colour: grey,
        };

        let contributorLink = {
          source: `${contributor}-${uuid}`,
          target: parentPathName,
          value: 1,
        };

        dataStore.nodes.push(contributorNode);
        dataStore.links.push(contributorLink);
      }
    }
  }
}

// logical ordering feature
async function getDirectoryEntries(entry) {
  const files = {};

  try {
    const directoryTree = await entry.getTree();
    const directoryEntries = directoryTree.entries();

    await Promise.all(
      directoryEntries.map(async (entry) => {
        if (!entry.isFile()) {
          files[entry.path()] = {
            entryName: entry.path(),
            isDirectory: true,
            children: await getDirectoryEntries(entry),
          };
        } else {
          files[entry.path()] = {
            entryName: entry.path(),
            isDirectory: false,
            children: null,
          };
        }
      })
    );
  } catch (error) {
    console.error(
      `Error fetching tree for entry '${entry.path()}':`,
      error.message
    );
  }

  return files;
}
