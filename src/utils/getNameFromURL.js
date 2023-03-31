export default function getNameFromURL(url) {
    const lastSlashIndex = url.lastIndexOf('/');
    return url.slice(lastSlashIndex + 1);
}