import { normalizePath, TFolder, Vault } from 'obsidian';

export class EntryNotExistError extends Error {
	code: string;

	constructor(message: string) {
		super(message);
		// must we differentiate between folder and file?
		this.code = "ENOENT";

		// Ensure the name property is set to the class name
		this.name = this.constructor.name;
	}
}

export type StatsObsidian = {
	isFile: () => boolean;
	isDirectory: () => boolean;
	isSymbolicLink: () => boolean,
	type: 'file' | 'folder';
	size: number;
	mtimeMs: number; // Modification time in milliseconds
	ctimeMs: number; // Creation time in milliseconds
};

export type PromiseFsObsidianParameters = {
	readFile: (path: string, opst: any) => Promise<string>;
	writeFile: (path: string, data: Buffer, options?: { encoding?: BufferEncoding }) => Promise<void>;
	unlink: (path: string) => Promise<void>;
	readdir: (path: string) => Promise<string[]>;
	mkdir: (path: string) => Promise<TFolder>;
	rmdir: (path: string, opts: any) => Promise<void>;
	stat: (path: string) => Promise<StatsObsidian>;
	lstat: (path: string) => Promise<StatsObsidian>;
	readlink?: (path: string) => Promise<string>;
	symlink?: (target: string, path: string) => Promise<void>;
	chmod?: (path: string, mode: number) => Promise<void>;
};

export class PromiseFsObsidian {
	public promises: PromiseFsObsidianParameters;
	private vault: Vault

	constructor(vault: Vault) {
		this.vault = vault;

		// Initialize promises with the methods
		this.promises = {
			readFile: this.readFile.bind(this),
			writeFile: this.writeFile.bind(this),
			readdir: this.readdir.bind(this),
			mkdir: this.mkdir.bind(this),
			rmdir: this.rmdir.bind(this),
			stat: this.stat.bind(this),
			unlink: this.unlink.bind(this),
			lstat: this.lstat.bind(this),
			readlink: this.readlink.bind(this),
			symlink: this.symlink.bind(this),
			chmod: this.chmod.bind(this),
		};
	}

	async readFile(path: string, opts: any): Promise<string | ArrayBuffer> {
		path = normalizePath(path);
		if (opts.encoding == 'utf8' || opts === 'utf8' ) {
			const content = await this.vault.adapter.read(path);
			return content;
		} else {
			const content = await this.vault.adapter.readBinary(path);
			return content;
		}
	}
	async writeFile(path: string, data: Buffer, options: { encoding: BufferEncoding } = { encoding: 'utf8' }) {
		path = normalizePath(path);
		console.log("write ", path, options, data);
		if (options.encoding == 'utf8') {
			return this.vault.adapter.write(path, data.toString(options.encoding));
		} else {
			return this.vault.adapter.writeBinary(path, data);
		}
	}
	async unlink(path: string) {
		path = normalizePath(path);
		return this.vault.adapter.remove(path);
	}
	async readdir(path: string) {
		path = normalizePath(path);
		const files = await this.vault.adapter.list(path);
		const filesAll = [...files.files, ...files.folders];
		const filesProcessed = filesAll.map((el) => {
			return el.replace(`${path}/`, '');
		});
		return filesProcessed;
	}
	async mkdir(path: string) {
		// can creat .folder paths
		return this.vault.adapter.mkdir(normalizePath(path));
	}
	async rmdir(path: string, opts: any) {
		// no vault analog function
		return this.vault.adapter.rmdir(path, opts?.recursive ?? false);
	}
	async stat(path: string): Promise<StatsObsidian> {
		const result = await this.vault.adapter.stat(normalizePath(path));
		if (result) {
			let isFunctions;
			if (result.type === 'folder') {
				isFunctions = {
					isFile: () => false,
					isDirectory: () => true,
					isSymbolicLink: () => false,
				};
			} else {
				isFunctions = {
					isFile: () => true,
					isDirectory: () => false,
					isSymbolicLink: () => false,
				};
			}
			const statsFinal = {
				...isFunctions,
				type: result.type,
				size: result.size,
				mtimeMs: result.mtime,
				ctimeMs: result.ctime,
			};
			return statsFinal;
		}
		throw new EntryNotExistError('File or directory not found');
	}
	lstat(path: string) {
		// `lstat` is similar to `stat` in this context since symbolic links are not supported
		return this.stat(path);
	}
	async readlink(path: string): Promise<string> {
		throw new Error('Symbolic links are not supported');
	}
	async symlink(target: string, path: string): Promise<void> {
		throw new Error('Symbolic links are not supported');
	}
	async chmod(path: string, mode: number): Promise<void> {
		throw new Error('Chmod is not supported');
	}
}

