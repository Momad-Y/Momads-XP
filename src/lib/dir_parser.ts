/**
 * Traversing directory using promises
 **/
import { required } from './types';
import type { CopyTree } from './types';

/** Chrome's drag-and-drop `File` objects expose a non-standard `lastModifiedDate`. */
interface LegacyFile extends File {
    lastModifiedDate?: Date;
}

export interface PackagedFile {
    fileObject: File;
    fullPath: string;
    lastModified: number;
    lastModifiedDate?: Date;
    name: string;
    size: number;
    type: string;
    webkitRelativePath: string;
}

/** `DataTransferItem` with the vendor-prefixed entry accessors modeled as optional. */
interface DataTransferItemWithEntry extends Omit<
    DataTransferItem,
    'webkitGetAsEntry'
> {
    webkitGetAsEntry?: () => FileSystemEntry | null;
    getAsEntry?: () => FileSystemEntry | null;
}

/** Minimal shape of the drop / input-change events `parse_dir` accepts. */
interface FilePickerEvent {
    dataTransfer?: DataTransferSource | null;
    target?: { files?: FileList | null } | null;
}

interface DataTransferSource {
    items?: DataTransferItemList;
    files?: FileList;
}

type EntryTree = FileSystemEntry | EntryTree[];

function is_directory_entry(
    entry: FileSystemEntry,
): entry is FileSystemDirectoryEntry {
    return entry.isDirectory;
}

function is_file_entry(entry: FileSystemEntry): entry is FileSystemFileEntry {
    return entry.isFile;
}

const traverseDirectory = (
    entry: FileSystemDirectoryEntry,
): Promise<EntryTree[]> => {
    const reader = entry.createReader();
    return new Promise((resolveDirectory) => {
        const iterationAttempts: Promise<EntryTree[]>[] = [];
        const errorHandler = () => {
            /* ignored, as in the untyped base */
        };

        function readEntries() {
            reader.readEntries((batchEntries) => {
                if (!batchEntries.length) {
                    resolveDirectory(Promise.all(iterationAttempts));
                } else {
                    iterationAttempts.push(
                        Promise.all(
                            batchEntries.map(
                                (batchEntry): Promise<EntryTree> => {
                                    if (is_directory_entry(batchEntry)) {
                                        return traverseDirectory(batchEntry);
                                    }
                                    return Promise.resolve(batchEntry);
                                },
                            ),
                        ),
                    );

                    readEntries();
                }
            }, errorHandler);
        }

        readEntries();
    });
};

const packageFile = (
    file: LegacyFile,
    entry?: FileSystemEntry,
): PackagedFile => {
    const object: PackagedFile = {
        fileObject: file,
        fullPath: entry ? entry.fullPath : '',
        lastModified: file.lastModified,
        lastModifiedDate: file.lastModifiedDate,
        name: file.name,
        size: file.size,
        type: file.type,
        webkitRelativePath: file.webkitRelativePath,
    };
    return object;
};

const getFile = (entry: FileSystemEntry): Promise<PackagedFile> => {
    return new Promise((resolve) => {
        // The untyped base called entry.file() unconditionally and crashed on
        // non-file entries; `required` keeps the same fail-fast behavior.
        const file_entry = required(
            is_file_entry(entry) ? entry : null,
            `file entry ${entry.fullPath}`,
        );
        file_entry.file((file) => {
            resolve(packageFile(file, entry));
        });
    });
};

const handleFilePromises = (
    promises: Promise<PackagedFile>[],
    fileList: (PackagedFile | DataTransferItemWithEntry)[],
): Promise<(PackagedFile | DataTransferItemWithEntry)[]> => {
    return Promise.all(promises).then((files) => {
        files.forEach((file) => {
            fileList.push(file);
        });
        return fileList;
    });
};

const getDataTransferFiles = (
    dataTransfer: DataTransferSource,
): Promise<(PackagedFile | DataTransferItemWithEntry)[]> => {
    const dataTransferFiles: (PackagedFile | DataTransferItemWithEntry)[] = [];
    const folderPromises: Promise<EntryTree[]>[] = [];
    const filePromises: Promise<PackagedFile>[] = [];

    const items: DataTransferItemWithEntry[] = Array.from(
        dataTransfer.items ?? [],
    );
    items.forEach((listItem) => {
        let supported_method: 'webkitGetAsEntry' | 'getAsEntry';
        if (typeof listItem.webkitGetAsEntry === 'function') {
            supported_method = 'webkitGetAsEntry';
        } else {
            supported_method = 'getAsEntry';
        }

        const get_entry = required(
            listItem[supported_method],
            supported_method,
        );
        const entry = get_entry.call(listItem);

        if (entry) {
            if (is_directory_entry(entry)) {
                folderPromises.push(traverseDirectory(entry));
            } else {
                filePromises.push(getFile(entry));
            }
        } else {
            dataTransferFiles.push(listItem);
        }
    });
    if (folderPromises.length) {
        const flatten = (array: EntryTree[]): FileSystemEntry[] =>
            array.reduce<FileSystemEntry[]>(
                (a, b) => a.concat(Array.isArray(b) ? flatten(b) : b),
                [],
            );
        return Promise.all(folderPromises).then((fileEntries) => {
            const flattenedEntries = flatten(fileEntries);
            flattenedEntries.forEach((fileEntry) => {
                filePromises.push(getFile(fileEntry));
            });
            return handleFilePromises(filePromises, dataTransferFiles);
        });
    } else if (filePromises.length) {
        return handleFilePromises(filePromises, dataTransferFiles);
    }

    return Promise.resolve(dataTransferFiles);
};

// Use this function by passing the drop or change event.
const getDroppedOrSelectedFiles = (
    event: FilePickerEvent,
): Promise<(PackagedFile | DataTransferItemWithEntry)[]> => {
    const dataTransfer = event.dataTransfer;
    if (dataTransfer && dataTransfer.items) {
        return getDataTransferFiles(dataTransfer).then((fileList) => {
            return Promise.resolve(fileList);
        });
    }

    const files: PackagedFile[] = [];
    const dragDropFileList = dataTransfer && dataTransfer.files;
    const inputFieldFileList = event.target && event.target.files;
    const fileList = dragDropFileList || inputFieldFileList || [];

    for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        if (file != null) {
            files.push(packageFile(file));
        }
    }

    return Promise.resolve(files);
};

function is_packaged_file(
    file: PackagedFile | DataTransferItemWithEntry,
): file is PackagedFile {
    return 'fileObject' in file;
}

export async function parse_dir(e: FilePickerEvent): Promise<CopyTree> {
    const files = await getDroppedOrSelectedFiles(e);

    const result: CopyTree = {};
    for (const file of files) {
        // The untyped base crashed here (`fullPath` of undefined) when a
        // non-file item, e.g. dragged text, reached this loop.
        const packaged = required(
            is_packaged_file(file) ? file : null,
            'packaged file',
        );
        const comps = packaged.fullPath.split('/').filter((el) => el != '');
        let cursor: CopyTree = result;
        for (let index = 0; index < comps.length; index++) {
            const el = comps[index];
            if (el == null) continue;
            if (index != comps.length - 1) {
                const next = cursor[el];
                if (next == null || next instanceof File) {
                    const created: CopyTree = {};
                    cursor[el] = created;
                    cursor = created;
                } else {
                    cursor = next;
                }
            } else {
                cursor[el] = packaged.fileObject;
            }
        }
    }
    return result;
}
