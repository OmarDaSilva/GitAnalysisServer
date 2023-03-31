import NodeGit from "nodegit";
import { v4 as uuidv4 } from "uuid";
import fse from "fs-extra/esm";
import timeBetween from "./src/utils/TimeBetween.js";
import { exec } from "child_process";
import util from 'util'
import getNameFromURL from './src/utils/getNameFromURL.js'
/*
      node colors:
      Dark blue - Directories
      Light blue - files
      Grey - contributors
*/
var darkblue = "darkblue";
var lightBlue = "lightblue";
var grey = "grey";
var globalRepo = null

var localPath = "./repos";
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
    const { stdout, stderr, success} = await execPromise(`git clone --bare --progress ${repositoryUrl} ${localPath}`);
    const repo = await NodeGit.Repository.open("./repos");
    console.log('test1');
    const branches = await getAllBranches(repo);
    console.log('test 2');
    let useBranch = branch == null ? branches.main : branch
    console.log(useBranch);
    // const branch = await repo.getBranch(branches.main)
    const repoData = await getRepoCommitDates(repo, useBranch);
    const repoName = getNameFromURL(repositoryUrl)

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
  deltaDates,
  accessToken = null,
  userName = null
) {
  try {
    const execPromise = util.promisify(exec);
    const { stdout, stderr, success} = await execPromise(`git clone --bare --progress ${repositoryUrl} ${localPath}`);
    const repo = await NodeGit.Repository.open("./repos");
    globalRepo = repo


    const repoData = await analysis(repo, branchName, deltaDates);

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
    let branches = refs.map((branch) => branch.name()).filter(branchName => !branchName.startsWith('refs/tags'))
    return {
      branches: refs.map((branch) => branch.name()).filter(branchName => !branchName.startsWith('refs/tags')),
      main: branches[0]
    }
  } else {
    return {
      branches: refs.map((branch) => branch.name()).filter(branchName => !branchName.startsWith('refs/tags')),
      main: mainOrMaster[0].name(),
    };
  }

}

async function analysis(repo, branch, deltaDates) {
  const headCommit = await repo.getBranchCommit(branch);
  const revWalk = repo.createRevWalk();
  revWalk.sorting(NodeGit.Revwalk.SORT.REVERSE);
  revWalk.push(headCommit.id());

  // set _commit => true as this will get every commit
  const commits = await revWalk.getCommitsUntil((_commit) => true);
  let cleanData = await composeData(commits, deltaDates);
  return cleanData;
}

async function processCommit(commit, cb, commitsByDay, deltaDates) {
  const commitDate = new Date(commit.date());
  // Reset the time to midnight to group by day
  commitDate.setHours(0, 0, 0, 0);
  const startTime = new Date(deltaDates.start).setHours(0, 0, 0, 0);
  const finishTime = deltaDates.finish
    ? new Date(deltaDates.finish).setHours(0, 0, 0, 0)
    : null;
  const commitEpoch = commit.date().setHours(0, 0, 0, 0);
  const dateString = commitDate.toISOString();

  // check commit is between/at selected time delta
  if (timeBetween(startTime, finishTime, commitEpoch)) {
    // Get Authors name
    const authorName = commit.committer().name();

    // check if the commit day key exists
    if (commitsByDay[dateString] == undefined) {
      commitsByDay[dateString] = {
        contributors: {},
        repoState: {},
        commitShas: [],
      };
    }

    // check if author exists for that specific day
    if (commitsByDay[dateString].contributors[authorName] == undefined) {
      commitsByDay[dateString].contributors[authorName] = {
        filesChanged: {},
      };
    }

    // log commit sha
    const commitSha = commit.id().tostrS(7);
    commitsByDay[dateString].commitShas.push(commitSha)
    
    // Get the files that have changed
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
      This function below gets the current state of the Repo using the branch and commit,
      it updates the state of the repo state on every commit, this is because we don't know
      if the next commit will be the next day or not and that requires retriving the next commit.
      it definitely not performance efficient but I haven't seen any siginifcant performance impact,
      However, for potentially large repos this could be observed. 
    */

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
  }

  cb();
}

async function composeData(commits, deltaDates) {
  var commitsByDay = {};

  let dataProcessor = commits.reduce((promiseChain, item) => {
    return promiseChain.then(
      () =>
        new Promise((resolve) => {
          processCommit(item, resolve, commitsByDay, deltaDates);
        })
    );
  }, Promise.resolve());

  const cleanData = await dataProcessor.then(() => dataFormatter(commitsByDay));
  return {cleanData, commitsByDay};
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
    const repoStateContributors = data[date].contributors;
    let currentTarget = "root";

    traverseNodeLeafes(
      repoState,
      dataFormatted[date],
      currentTarget,
      repoStateContributors
    );
  });

  return dataFormatted;
}

function traverseNodeLeafes(
  children,
  dataStore,
  parentNodePath,
  repoStateContributors
) {
  let newGroupNumber = Math.floor(Math.random() * (1000 - 1 + 1)) + 1;
  for (const [pathName, value] of Object.entries(children)) {
    if (!value.isDirectory) {
      let node = {
        id: pathName,
        name: pathName,
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
        repoStateContributors
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
