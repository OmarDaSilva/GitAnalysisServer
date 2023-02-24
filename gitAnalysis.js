import NodeGit from "nodegit"
import eventsEmitter from "./EventEmitter.js"

var index = 0;

export default async function gitAnalysis(repoFilepath, branch) {
  const repo = await NodeGit.Repository.open(repoFilepath);
  const masterBranch = await repo.getMasterCommit();

  const masterBrancHistory = masterBranch.history(NodeGit.Revwalk.SORT.TIME);

  composeFile(masterBrancHistory);
  masterBrancHistory.start();
}

async function composeFile(branchEventEmitter) {
  const contributors = {};
   /* 
      This function gets all the commits and then creates an author object that stores information about which
      files this contributor has changed up to the most recent commit
    */
  branchEventEmitter.on("commit", async (commit) => {
    let authorName = commit.committer().name();

    if (contributors[authorName] == undefined) {
      contributors[authorName] = {
        contributions: 0,
        files: [],
      };

      let currentCommitTreeEntires = await commit.getTree();
      let filenames = currentCommitTreeEntires.entries()
      
      // potential duplicating code
      filenames.forEach(async (entry) => {
        if (entry.isFile()) {
          contributors[authorName].files.push({
            entryName: entry.name(),
            isDirectory: false,
            children: null
          })
        } else {
          contributors[authorName].files.push({
            entryName: entry.name(),
            isDirectory: true,
            children: await getDirectoryEntries(entry)
          })
        }
      })    
    }

  });

  branchEventEmitter.on('end',  () => {
    eventsEmitter.emit('FileComposed', contributors);
  });
}

async function getDirectoryEntries(entry) {
  const files = [];
  const directoryTree = await entry.getTree();
  const directoryEntries = directoryTree.entries();
  directoryEntries.forEach(async (entry) => {
    if (!entry.isFile()) {
      files.push({
        entryName: entry.name(),
        isDirectory: true,
        children: await getDirectoryEntries(entry)
      })
    } else {
      files.push({
        entryName: entry.name(),
        isDirectory: false,
        children: null
      })
    }
  })

  return files
}



