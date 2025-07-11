import { GitHttpRequest, GitHttpResponse } from 'isomorphic-git/http/web';
import git, { AuthCallback, AuthFailureCallback, AuthSuccessCallback, CallbackFsClient, FetchResult, GitAuth, MessageCallback, ProgressCallback, PromiseFsClient, PushResult, ReadCommitResult } from 'isomorphic-git';
import { PromiseFsObsidian } from './promise_fs_obsidian';
import { requestUrl, Vault, moment } from 'obsidian';
import { collect } from './collect';
import { GitMiniSettings } from 'src/settings/default_settings';

const FILE = 0, HEAD = 1, WORKDIR = 2, STAGE = 3;

type Filename = string;
type HeadStatus = 0 | 1;
type WorkdirStatus = 0 | 1 | 2;
type StageStatus = 0 | 1 | 2 | 3;

type StatusRow = [Filename, HeadStatus, WorkdirStatus, StageStatus];
type StatusMatrix = StatusRow[];

export interface GitInfo {
	fs: CallbackFsClient | PromiseFsClient;
	onProgress?: ProgressCallback;
	onMessage?: MessageCallback;
	onAuth?: AuthCallback;
	onAuthFailure?: AuthFailureCallback;
	onAuthSuccess?: AuthSuccessCallback;
	dir: string;
	gitdir?: string;
	cache?: any;
}


export interface BranchInfo {
	current?: string;
	tracking?: string;
	branches: string[];
}

export class SettingsEmptyError extends Error {
	settingName: string;

	constructor(name: string, message: string) {
		super(message);
		// must we differentiate between folder and file?
		this.settingName = name;

		// Ensure the name property is set to the class name
		this.name = this.constructor.name;
	}
}

export class AlreadyHasGitError extends Error {
	constructor(message: string) {
		super(message);
		this.name = this.constructor.name;
	}
}

export class IsomorphicGit {
	// because they are using private class
	// inside cache
	cache: any;
	private fs: PromiseFsObsidian;
	private settings: GitMiniSettings;
	private repositoryRoot = '.';
	private getPassword: () => Promise<string | null>

	constructor({
		vault,
		settings,
		getPassword,
	}: {
		vault: Vault;
		settings: GitMiniSettings;
		getPassword: () => Promise<string | null>;
	}
	) {
		this.cache = {};
		this.fs = new PromiseFsObsidian(vault);
		this.settings = settings;
		this.getPassword = getPassword;
	}

	/**
	 * Returns the HttpClient for the isomorphic-git
	 * use it when you need to get information from github
	 */
	async gitGet() {
		return {
			http: {
				async request({ url, method, headers, body }: GitHttpRequest): Promise<GitHttpResponse> {
					let bodyCollected;
					if (body) {
						bodyCollected = body.toString({ encoding: 'utf8' })
					}

					const res = await requestUrl({
						url,
						method,
						headers,
						body: bodyCollected,
						throw: false,
					});
					const result = {
						url,
						method,
						headers: res.headers,
						body: [new Uint8Array(res.arrayBuffer)],
						statusCode: res.status,
						statusMessage: res.status.toString(),
					};
					return result;
				}
			}
		}
	}

	/**
	 * Returns the HttpClient for the isomorphic-git
	 * use it when you need to send information to github
	 */
	async gitSend() {
		return {
			http: {
				async request({
					url,
					method,
					headers,
					body,
				}: GitHttpRequest): Promise<GitHttpResponse> {
					// We can't stream yet, so collect body and set it to the ArrayBuffer
					// because that's what requestUrl expects
					if (body) {
						body = await collect(body);
						body = body.buffer;
					}

					const res = await requestUrl({
						url,
						method,
						headers,
						body,
						throw: false,
					});
					const result = {
						url,
						method,
						headers: res.headers,
						body: [new Uint8Array(res.arrayBuffer)],
						statusCode: res.status,
						statusMessage: res.status.toString(),
					};
					return result;
				},
			},
		}
	}

	/**
	 * Checking that all settings are seted up
	 *
	 * @throws {SettingsEmptyError}
	 */
	async checkGitsidianSettings() {
		if (!this.settings.username) {
			throw new SettingsEmptyError("Username", "Empty username field in the settings");
		}
		if (!this.settings.email) {
			throw new SettingsEmptyError("Email", "Empty email field in the settings");
		}
		if (!await this.getPassword()) {
			throw new SettingsEmptyError("Access token", "Empty access token in the settings");
		}
		if (!this.settings.gitBranch) {
			throw new SettingsEmptyError("Branch", "Empty branch in the settings");
		}
		if (!this.settings.repositoryUrl) {
			throw new SettingsEmptyError("Git URL", "Empty repository url in the settings");
		}
	}

	/**
	 * Returns the common information about current git repo
	 * fot the isomorphic-git actions
	 */
	async gitInfo(): Promise<GitInfo> {
		await this.checkGitsidianSettings();
		return {
			fs: this.fs.promises,
			dir: this.repositoryRoot,
			//gitdir: this.gitRoot,
			//corsProxy: 'https://cors.isomorphic-git.org',
			cache: this.cache,
			//onProgress: (progress) => console.log(progress),
			//onMessage: (message) => console.log(message),
			onAuth: this.onAuth.bind(this),
		}
	}

	async onAuth(): Promise<void | GitAuth> {
		const password = await this.getPassword();
		if (!password) {
			return { cancel: true }
		}
		return {
			username: this.settings.username,
			password: password,
		};
	}
	/**
	 * @throws {SettingsEmptyError}
	*/
	async setInitConfig() {
		if (!this.settings.gitBranch) {
			throw new SettingsEmptyError('Git Branch', 'Empty git branch in the settings');
		}
		await this.checkGitsidianSettings();

		const gitInfo = await this.gitInfo();
		await git.setConfig({
			...gitInfo,
			path: 'user.name',
			value: this.settings.username,
		})
		await git.setConfig({
			...gitInfo,
			path: 'user.email',
			value: this.settings.email,
		})
		await git.setConfig({
			...gitInfo,
			path: 'pull.ff',
			value: 'only'
		})
		await git.setConfig({
			...gitInfo,
			path: `branch.${this.settings.gitBranch}.remote`,
			value: 'origin'
		})
		await git.setConfig({
			...gitInfo,
			path: `branch.${this.settings.gitBranch}.merge`,
			value: `refs/heads/${this.settings.gitBranch}`
		})
	}

	async alreadyHasGit(): Promise<boolean> {
		try {
			await this.fs.stat('./.git');
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * @throws {SettingsEmptyError}
	 * @throws {AlreadyHasGitError}
	*/
	async clone({
		onProgress
	}: {
		onProgress?: ProgressCallback | undefined;
	}): Promise<void> {
		//if (await this.alreadyHasGit()) {
		//	throw new AlreadyHasGitError(
		//		'Git repository already present',
		//	);
		//}
		if (!this.settings.repositoryUrl) {
			throw new SettingsEmptyError(
				'Repository URL',
				'Empty repository url in the settings',
			);
		}
		if (!this.settings.gitBranch) {
			throw new SettingsEmptyError(
				'Git branch',
				'Empty git branch in the settings',
			);
		}
		await git.clone({
			...await this.gitInfo(),
			...await this.gitGet(),
			url: this.settings.repositoryUrl,
			ref: this.settings.gitBranch,
			depth: 1,
			onProgress: onProgress,
		});
	}

	// Define an async generator to process each file
	async *statusGeneratorRespectGitignore(matrix: StatusMatrix, gitInfo: GitInfo): AsyncGenerator<any> {
		for (let i = 0; i < matrix.length; i++) {
			const statusRow = matrix[i];
			const filepath = statusRow[FILE];
			const isGitIgnored = await git.isIgnored({
				...gitInfo,
				filepath,
			});

			if (!isGitIgnored) {
				yield statusRow;
			}
		}
	}

	async stageAllChanges({
		matrix,
		onProgress,
	}: {
		matrix: StatusMatrix,
		onProgress?: (counter: number) => void | Promise<void>,

	}): Promise<boolean> {
		let counter = 0
		const gitInfo = await this.gitInfo();

		for await (const statusRow of this.statusGeneratorRespectGitignore(matrix, gitInfo)) {
			if (statusRow[WORKDIR] === statusRow[STAGE]) {
				continue
			}
			// file which was deleted
			if (statusRow[HEAD] === 1 && statusRow[WORKDIR] === 0) {
				await git.remove({
					...gitInfo,
					filepath: statusRow[FILE],
				});

				// if workdir != stage, and file was not removed
				// add it
			} else {
				await git.add({
					...gitInfo,
					filepath: statusRow[FILE],
				});

			}
			counter += 1
			if (onProgress) {
				onProgress(counter);
			}
		}
		return counter !== 0;
	}
	async branchInfo(): Promise<BranchInfo & { remote: string }> {
		try {
			const gitInfo = await this.gitInfo();
			const current = (await git.currentBranch(gitInfo)) || "";
			const branches = await git.listBranches(gitInfo);

			const remote =
				(await git.getConfig({
					...gitInfo,
					path: `branch.${current}.remote`
				})) ?? "origin";

			const trackingBranch = (
				await git.getConfig({
					...gitInfo,
					path: `branch.${current}.merge`,
				})
			)?.split("refs/heads")[1];

			const tracking = trackingBranch
				? remote + trackingBranch
				: undefined;

			return {
				current: current,
				tracking: tracking,
				branches: branches,
				remote: remote,
			};
		} catch (error) {
			console.log(error);
			throw error;
		}
	}

	async statusMatrix(): Promise<StatusMatrix> {
		const result = await git.statusMatrix({
			...await this.gitInfo(),
		});
		return result;
	}

	async getCurrentBranchInfo() {
		const info = await git.currentBranch({
			...await this.gitInfo(),
		});
		console.log('BranchInfo: ', info);
	}

	async createBranch(branchName: string) {
		await git.branch({
			fs: this.fs,
			dir: this.repositoryRoot,
			ref: branchName,
			checkout: true,
		})
	}

	/**
	 * @throws {SettingsEmptyError}
	 * @throws {AlreadyHasGitError}
	*/
	async init() {
		if (!this.settings.gitBranch) {
			throw new SettingsEmptyError('Git Branch', 'Empty git branch in the settings');
		}
		if (!this.settings.repositoryUrl) {
			throw new SettingsEmptyError('repositoryUrl', 'Empty repository url in the settings');
		}
		if (await this.alreadyHasGit()) {
			throw new AlreadyHasGitError(
				'Git repository already present',
			);
		}
		let gitInfo = await this.gitInfo();
		await git.init({
			...gitInfo,
			...await this.gitGet(),
			defaultBranch: this.settings.gitBranch,
		});
		await this.setInitConfig();
		await git.addRemote({
			...gitInfo,
			remote: 'origin',
			url: this.settings.repositoryUrl,
		})
	}

	/**
	 * @throws {SettingsEmptyError}
	*/
	async pull(
		{
			onProgress
		}: {
			onProgress?: ProgressCallback | undefined;
		}): Promise<FetchResult> {
		if (!this.settings.repositoryUrl) {
			throw new SettingsEmptyError('repositoryUrl', 'Empty repository url in the settings');
		}
		const gitInfo = await this.gitInfo();
		const remoteInfo = await git.fetch({
			...gitInfo,
			...await this.gitGet(),
			ref: this.settings.gitBranch,
			url: this.settings.repositoryUrl,
		});
		const branchInfo = await this.branchInfo();

		const mergeRes = await
			git.merge({
				...gitInfo,
				ours: branchInfo.current,
				theirs: branchInfo.tracking!,
				abortOnConflict: false,
			});
		if (!mergeRes.alreadyMerged) {
			await git.checkout({
				...gitInfo,
				ref: branchInfo.current,
				onProgress: onProgress,
				remote: branchInfo.remote,
			});
		}
		return remoteInfo;
	}

	/**
	 * @throws {SettingsEmptyError}
	*/
	async commit(): Promise<void> {
		const messageTemplate = this.settings.commitTemplate;
		if (!messageTemplate) {
			throw new SettingsEmptyError(
				'Commit Template',
				'Empty commit message template in the settings',
			);
		}
		const dateRegex = new RegExp(/{{date:(.*?)}}/);
		const dateMatch = messageTemplate.match(dateRegex);

		let message = '';
		if (dateMatch) {
			const timestampTemplate = dateMatch[1];
			const timestamp = moment().format(timestampTemplate);
			message = messageTemplate
				.replace(dateMatch[0], timestamp)
		} else {
			message = messageTemplate;
		}

		await git.commit({
			...await this.gitInfo(),
			message: message,
		});
	}

	/**
	 * @throws {SettingsEmptyError}
	*/
	async push(): Promise<PushResult> {
		if (!this.settings.repositoryUrl) {
			throw new SettingsEmptyError('repositoryUrl', 'Empty repository url in the settings');
		}
		const result = await git.push({
			...await this.gitInfo(),
			...await this.gitSend(),
			url: this.settings.repositoryUrl,
		});
		return result;
	}

	async getLastLog(): Promise<ReadCommitResult[]> {
		return git.log({
			...await this.gitInfo(),
			depth: 1,
		})
	}

	async hasChangesToPush(remoteInfo: FetchResult): Promise<boolean> {
		const remoteSha = remoteInfo.fetchHead;
		if (remoteSha) {
			const lastCommit = await this.getLastLog();
			if (lastCommit[0].oid !== remoteSha) {
				return true;
			}

		}
		return false;
	}

	clear() {
		this.cache = null;
		//const gitIndexPath = (this.gitRoot ?? '.git') + '/index';
		//
		//const cache = this.cache;
		//const symbols = Object.getOwnPropertySymbols(cache);
		//const indexCacheSymbol = symbols.find(sym => cache[sym] && cache[sym].map && cache[sym].stats);
		//if (indexCacheSymbol) {
		//	const indexCache = cache[indexCacheSymbol];
		//
		//	const gitIndex = indexCache.map.get(gitIndexPath);
		//	if (gitIndex) {
		//		gitIndex.clear();
		//	}
		//	const statsCache = indexCache.stats;
		//	if (statsCache instanceof Map) {
		//		statsCache.clear();
		//	}
		//	this.cache = null;
		//}

	}
}
