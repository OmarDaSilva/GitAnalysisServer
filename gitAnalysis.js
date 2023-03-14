import NodeGit from "nodegit";
import { v4 as uuidv4 } from 'uuid';
/*
      node colors:
      Dark blue - Directories
      Light blue - files
      Grey - contributors
*/
var darkblue = "darkblue";
var lightBlue = "lightblue";
var grey = "grey";

var localPath = './repos'

export async function RepoDatesAnalysis(url, branchName) {
  const repo = await NodeGit.Clone(url, localPath, {
    fetchOpts: {
      depth: null
    }
  })


  const branches = await getAllBranches(repo);

  const branch = branchName
    ? await repo.getBranch(branchName)
    : await repo.getBranch(branches.main);

  const repoData = await analysis(repo, branch);

  return {
    dates: repoData,
    repoBranches: branches
  }

}

export default async function gitAnalysis(repoFilepath, branchName, deltaDates) {
  const repo = await NodeGit.Repository.open(repoFilepath);
  const branches = await getAllBranches(repo);

  const branch = branchName
    ? await repo.getMasterCommit(branchName)
    : await repo.getBranch(branches.main);

  const repoData = await getRepoCommitDates(repo, branch);
  return {
    repoDates: repoData,
    repoUrl: 'test'
  };
}

async function getRepoCommitDates(repo, branch) {
  const headCommit = await repo.getBranchCommit(branch);

  const revWalk = repo.createRevWalk();
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

  return commitsByDay  
}

async function getCommitDates(commit, cb, commitsByDay) {
  const commitDate = new Date(commit.date());
  // Reset the time to midnight to group by day
  commitDate.setHours(0, 0, 0, 0);
  const dateString = commitDate.toISOString();
  let count = 0
  if (commitsByDay[dateString] == undefined) {
    commitsByDay[dateString] = {
      indx: count++
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

  return {
    branches: refs,
    main: mainOrMaster[0],
  };
}

async function analysis(repo, branch) {
  const headCommit = await repo.getBranchCommit(branch);

  const revWalk = repo.createRevWalk();
  revWalk.sorting(NodeGit.Revwalk.SORT.REVERSE);
  revWalk.push(headCommit.id());

  const commits = await revWalk.getCommitsUntil((_commit) => true);
  let cleanData = await composeData(commits);
  return cleanData;
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
    This function below gets the current state of the Repo using the branch and commit,
    it updates the state of the repo state on every commit, this is because we don't know
    if the next commit will be the next day or not and that requires retriving the next commit.
    it doesn't seem it's performance efficient but I haven't seen any siginifcant performance impact,
    However, for potentially large repos this could be observed
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

  const cleanData = await dataProcessor.then(() => dataFormatter(commitsByDay));
  return cleanData;
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
      traverseNodeLeafes(value.children, dataStore, pathName, repoStateContributors);
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
      if (repoStateContributors[contributor].filesChanged[parentPathName] != undefined) {
        let uuid = uuidv4()
        let contributorNode = {
          id: `${contributor}-${uuid}`,
          name: contributor,
          group: newGroupNumber,
          colour: grey
        };
  
        let contributorLink = {
          source: `${contributor}-${uuid}`,
          target: parentPathName,
          value: 1
        }
  
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
