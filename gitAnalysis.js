import NodeGit from "nodegit";
import { v4 as uuidv4 } from "uuid";
import fse from "fs-extra/esm";
import timeBetween from "./src/utils/TimeBetween.js";
import { exec } from "child_process";
import util from "util";
import getNameFromURL from "./src/utils/getNameFromURL.js";
import getFileExtension from './src/utils/getFileExtension.js'
import colourFilePicker from "./src/utils/colourFilePicker.js";
import {createDirectoriesRegex, createDirectoriesMinDepthRegex} from "./src/utils/groupRegex.js";
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
    const branches = await getAllBranches(repo);
    let useBranch = branch == null ? branches.main : branch;
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
  selectedDates,
  showChanges
) {
  try {
    const execPromise = util.promisify(exec);
    const { stdout, stderr, success } = await execPromise(
      `git clone --bare --progress ${repositoryUrl} ${localPath}`
    );
    const repo = await NodeGit.Repository.open("./repos");
    globalRepo = repo;

    const repoData = await analysis(repo, branchName, config, selectedDates, showChanges);

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

async function analysis(repo, branch, config, selectedDates, showChanges) {
  const headCommit = await repo.getBranchCommit(branch);
  const revWalk = repo.createRevWalk();
  revWalk.sorting(NodeGit.Revwalk.SORT.REVERSE);
  revWalk.push(headCommit.id());

  // set _commit => true as this will get every commit
  const commits = await revWalk.getCommitsUntil((_commit) => true);
  let cleanData = await composeData(commits, config, selectedDates, showChanges);

  return cleanData;
}

async function processCommit(
  commit,
  cb,
  commitsByDay,
  config,
  significantEvents,
  fileIndex,
  selectedDates,
  changedFilesEachDay,
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

    if (config?.includeContributor != null) {
      if (
        commitsByDay[dateString].contributors[authorName] == undefined &&
        config.includeContributor == authorName
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

        if (changedFilesEachDay[dateString] == undefined) {
          changedFilesEachDay[dateString] = {
            filePaths: [newFile]
          }
        } else {
          changedFilesEachDay[dateString].filePaths.includes(newFile) ? null : (
            changedFilesEachDay[dateString].filePaths.push(newFile)
          )
        }

        if (newFile && config?.includeContributor) {
          if (config?.includeContributor == authorName) {

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

async function composeData(commits, config, selectedDates, showChanges) {
  var commitsByDay = {};
  var significantEvents = {};
  let fileIndex = {}
  let changedFilesEachDay = {}

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
              selectedDates,// Move selectedDates down
              changedFilesEachDay,
            );
          })
      );
    }, Promise.resolve());

    const cleanData = await dataProcessor.then(() =>
      dataFormatter(commitsByDay, fileIndex, config, changedFilesEachDay, showChanges)
    );
    return { cleanData, commitsByDay, significantEvents, fileIndex };
  } catch (error) {
    console.log(error);
  }
}

function dataFormatter(data, fileIndex, config, changedFilesEachDay, showChanges) {
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
      fileIndex[date],
      config,
      changedFilesEachDay,
      date,
      showChanges
    );
  });

  return { dataFormatted, fileIndex };
}

function traverseNodeLeafes(
  children,
  dataStore,
  parentNodePath,
  repoStateContributors,
  fileIndex,
  config,
  changedFilesEachDay,
  date,
  showChanges
) {


  
  let directorMaxDepthRegex = config?.GroupDirectories ? createDirectoriesRegex(config?.GroupDirectories) : null
  let directoriesMinDepthRegex = config?.GroupDirectoriesMinDepth ? createDirectoriesMinDepthRegex(config?.GroupDirectoriesMinDepth) : null

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

      
      let renderNode = true
      if (config?.GroupDirectories || config?.GroupDirectoriesMinDepth) {
        
        if (directorMaxDepthRegex?.test(pathName) || directoriesMinDepthRegex?.test(pathName)) {
          renderNode = false
        }
      }

      // check if path name, includes directory name, this is so that
      // we can check if the file is within this directory
      let changedFile = false

      if (changedFilesEachDay[date]?.filePaths != undefined) {
        changedFile = changedFilesEachDay[date].filePaths?.includes(pathName)
      }

      let colour = 'Black'
      let ind = index !== undefined && index !== null
    
      if (ind) {
        if (config?.includeContributor) {
         colour =  repoStateContributors[config.includeContributor].filesChanged[pathName] != undefined ? 'Aqua' : 'Grey' 
        } else if (showChanges) {
          colour = changedFile ? 'FileYellow' : 'Grey'
        } else {
          colour = colourFilePicker(index)
        }
      }

      if (renderNode) {
        let node = {
          id: pathName,
          name: pathName,
          group: newGroupNumber,
          colour: colour
        };
        let link = {
          source: pathName,
          target: parentNodePath,
          value: 1,
        };

        dataStore.nodes.push(node);
        dataStore.links.push(link);
      } else {
        groupingDirectoriesContribuions(pathName, dataStore, config, repoStateContributors)
      }

    } else {

      let renderNode = darkblue
      if (config?.GroupDirectories || config?.GroupDirectoriesMinDepth) {
        if (directorMaxDepthRegex?.test(pathName) || directoriesMinDepthRegex?.test(pathName)) {
          renderNode = 'FolderGrey'
        } 
      } else if (config?.includeContributor) {
        renderNode =  repoStateContributors[config.includeContributor].filesChanged[pathName] != undefined ? 'AquaFolder' : 'FolderGrey' 
      } 

      let node = {
        id: pathName,
        name: pathName,
        group: newGroupNumber,
        colour: renderNode,
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
        fileIndex,
        config,
        changedFilesEachDay,
        date,
        showChanges
      );
    }
  }
}

function groupingDirectoriesContribuions(
  parentPathName,
  dataStore,
  config,
  repoStateContributors,
) {
  if (config?.GroupDirectories) {
    
    // we define, our new authors object that we loop ove
      let directorMaxDepthRegex = config?.GroupDirectories ? createDirectoriesRegex(config?.GroupDirectories) : null
      let directoriesMinDepthRegex = config?.GroupDirectoriesMinDepth ? createDirectoriesMinDepthRegex(config?.GroupDirectoriesMinDepth) : null
  
      if (directorMaxDepthRegex?.test(parentPathName) || directoriesMinDepthRegex?.test(parentPathName)) {
        const parentDirectory = parentPathName.substring(0, parentPathName.lastIndexOf('/'));
  
        // Check if the parent directory node exists in the node dataStore
        let parentNode = dataStore.nodes.find(node => node.id === parentDirectory);
  
        if (parentNode) { 
          
          if (config?.includeContributor) {
            parentNode.colour =  repoStateContributors[config.includeContributor].filesChanged[parentPathName] != undefined ? 'AquaFolder' : 'FolderGrey' 
          } else {
            parentNode.colour = 'Yellow';
          }
          // Set the color of the parent directory node to 'Gold'
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
