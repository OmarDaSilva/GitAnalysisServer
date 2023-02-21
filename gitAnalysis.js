const NodeGit = require("nodegit");

async function gitAnalysis(repoFilepath) {
  const repo = await NodeGit.Repository.open(repoFilepath);
  const masterBranch = await repo.getMasterCommit();

  const masterBrancHistory = masterBranch.history(NodeGit.Revwalk.SORT.TIME);

  composeFile(masterBrancHistory);
  masterBrancHistory.start();
}

async function composeFile(branchEventEmitter) {
  var contributors = {};

  branchEventEmitter.on("commit", (commit) => {
    let authorName = commit.committer().name();
    console.log(
      "check if equal to undefined ",
      contributors[authorName] == undefined
    );

    if (contributors[authorName] == undefined) {
      contributors[authorName] = {
        files: [],
      };
    }
  });

  branchEventEmitter.on('end',  () => {
    server.emit('FileComposed');
  });
}




module.exports = gitAnalysis; // Changed line
