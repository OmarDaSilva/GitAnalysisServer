import NodeGit from "nodegit";
import eventsEmitter from "./EventEmitter.js";

var index = 0;

export default async function gitAnalysis(repoFilepath, branchName) {
  const repo = await NodeGit.Repository.open(repoFilepath);
  const branches = await getAllBranches(repo);

  // const branch = await repo.getBranch(test);
  const branch = branchName
    ? await repo.getBranch(branchName)
    : await repo.getBranch(branches.main);

  await composeJSONFile(repo, branch);

  // const masterBranch = await repo.getMasterCommit();

  // const masterBrancHistory = masterBranch.history(NodeGit.Revwalk.SORT.TIME);

  // composeFile(masterBrancHistory);
  // masterBrancHistory.start();
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
  // const commitsByDay = {};
  const headCommit = await repo.getBranchCommit(branch);

  const revWalk = repo.createRevWalk();
  revWalk.sorting(NodeGit.Revwalk.SORT.REVERSE);
  revWalk.push(headCommit.id());

  const commits = await revWalk.getCommitsUntil((_commit) => true);
  await composeData(commits);

  // TODO: Rewrite compose file to take the commits array and process it
}

async function composeData(commits) {
  const commitsByDay = {};

  commits.forEach(async (commit) => {
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
        filesChanged: [],
      };
    }

    const diffArray = await commit.getDiff();
    if (diffArray.length == 1) {
      const diff = diffArray[0];
      const patches = await diff.patches();
      const modifiedFiles = [];
      

      for (const patch of patches) {
        const newFile = patch.newFile().path();

        if (newFile) {
          commitsByDay[dateString].contributors[authorName].filesChanged.push(
            newFile
          );
        }
      }
    }

    /* 
      This function below gets the current state of our Repo,
      Todo: We need to make sure we include 
    */

    let currentCommitTreeEntires = await commit.getTree();
    let filenames = currentCommitTreeEntires.entries();

    filenames.forEach(async (entry) => {
      // We also need to consider when we touch two different files in a directory in different commits
      if (commitsByDay[dateString].repoState[entry.path()] == undefined) {
        if (entry.isFile()) {
          commitsByDay[dateString].repoState[entry.path()] = {
            entryName: "./" + entry.path(),
            isDirectory: false,
            children: null,
          };
        } else {
          commitsByDay[dateString].repoState[entry.path()] = {
            entryName: "./" + entry.path(),
            isDirectory: true,
            children: await getDirectoryEntries(entry),
          };
        }
      }
    });
  });

  eventsEmitter.emit("FileComposed", commitsByDay);
}

// async function composeFile(branchEventEmitter) {

//   const commitsByDay = {};
//   // const contributors = {};
//    /*
//       This function gets all the commits and then creates an author object that stores information about which
//       files this contributor has changed up to the most recent commit
//     */
//   branchEventEmitter.on("commit", async (commit) => {
//     const commitDate = new Date(commit.date());
//     // Reset the time to midnight to group by day
//     commitDate.setHours(0, 0, 0, 0);
//     const dateString = commitDate.toISOString();

//     // Get Authors name
//     const authorName = commit.committer().name();

//     if (commitsByDay[dateString] == undefined) {
//       commitsByDay[dateString] = {
//         contributors: {},
//         repoState: {}
//       };
//     }

//     if (commitsByDay[dateString].contributors[authorName] == undefined) {
//       commitsByDay[dateString].contributors[authorName] = {
//         filesChanged: []
//       };
//     }

//     const diffArray = await commit.getDiff();
//     if (diffArray.length == 1) {

//       const diff = diffArray[0];
//       const patches = await diff.patches();
//       const modifiedFiles = [];

//       for (const patch of patches) {
//         const newFile = patch.newFile().path();

//         if (newFile) {
//           commitsByDay[dateString].contributors[authorName].filesChanged.push(newFile);
//         }
//       }
//     }

//     /*
//       This function below gets the current state of our Repo,
//       Todo: We need to make sure we include
//     */

//     let currentCommitTreeEntires = await commit.getTree();
//     let filenames = currentCommitTreeEntires.entries();

//     filenames.forEach(async (entry) => {
//       // We also need to consider when we touch two different files in a directory in different commits
//       if (commitsByDay[dateString].repoState[entry.path()] == undefined) {
//         if (entry.isFile()) {
//           commitsByDay[dateString].repoState[entry.path()] = {
//             entryName: "./" + entry.path(),
//             isDirectory: false,
//             children: null
//           }
//         } else {
//           commitsByDay[dateString].repoState[entry.path()] = {
//             entryName: "./" + entry.path(),
//             isDirectory: true,
//             children: await getDirectoryEntries(entry)
//           }
//         }
//       }
//     })
//   });

//   branchEventEmitter.on('end',  () => {
//     eventsEmitter.emit('FileComposed', commitsByDay);
//   });

// }

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
      };
    } else {
      files[entry.path()] = {
        entryName: entry.path(),
        isDirectory: false,
        children: null,
      };
    }
  });

  return files;
}
