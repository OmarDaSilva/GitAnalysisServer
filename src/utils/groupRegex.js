export default function createDirectoriesRegex(directoryNames) {
  const escapedDirectoryNames = directoryNames.map((dir) => dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regexPattern = `.*(${escapedDirectoryNames.join('|')})\/.+`;
  return new RegExp(regexPattern);
}