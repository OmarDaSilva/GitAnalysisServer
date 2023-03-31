import { exec } from "child_process";
import util from "util";

async function gitClone(username, repoUrl, repoName, sshKey) {
  const execPromise = util.promisify(exec);

  const { stdout, stderr } = sshKey
    ? await execPromise(
        `git clone --bare -c "core.sshCommand=ssh -i ${sshKey}" --progress git@github.com:${username}/${repoName}.git ./repos`
      )
    : await execPromise(`git clone --bare --progress ${repoUrl} ./repos`);
}
export default gitClone
