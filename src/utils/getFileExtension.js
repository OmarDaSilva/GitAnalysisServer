export default function getFileExtension(fileName) {
    // Split the file path to get the last part (basename)
    const delimiter = fileName.includes('/') ? '/' : '\\';
    const basename = fileName.split(delimiter).pop();

    // Check if the basename has an extension
    const match = basename.match(/\.([^.]+)$/);

    // Return the extension or 'misc' if no extension is found
    return match ? match[1] : 'misc';
}