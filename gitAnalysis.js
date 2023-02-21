import NodeGit from "nodegit"
import eventsEmitter from "./EventEmitter.js"

export default async function gitAnalysis(repoFilepath) {
  const repo = await NodeGit.Repository.open(repoFilepath);
  const masterBranch = await repo.getMasterCommit();

  const masterBrancHistory = masterBranch.history(NodeGit.Revwalk.SORT.TIME);

  composeFile(masterBrancHistory);
  masterBrancHistory.start();
}

async function composeFile(branchEventEmitter) {
  const contributors = {};

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
    eventsEmitter.emit('FileComposed', contributors);
  });
}




