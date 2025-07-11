import { App, Notice, Plugin } from 'obsidian';
import { AlreadyHasGitError, IsomorphicGit, SettingsEmptyError } from './git/isomorphic_git/isomorphic_git';
import { DEFAULT_SETTINGS, GitMiniSettings } from './settings/default_settings';
import { GitMiniSettingTab } from './settings/settings_tab';

declare module "obsidian" {
	interface App {
		loadLocalStorage(key: string): string | null;
		saveLocalStorage(key: string, value: string | undefined): void;
	}
}

export default class GitMini extends Plugin {
	private prefix: string;
	settings: GitMiniSettings;
	gitManager: IsomorphicGit;

	async onload() {
		this.prefix = this.manifest.id + ":";

		await this.loadSettings();

		this.gitManager = new IsomorphicGit({
			vault: this.app.vault,
			settings: this.settings,
			getPassword: this.getPassword.bind(this),
		});

		// @ts-ignore
		if (!window.__gitminiAlreadyPulled === undefined) {
			// @ts-ignore
			window.__gitminiAlreadyPulled = false;
		}
		// @ts-ignore
		if (this.settings.autoPullOnBoot && !window.__gitminiAlreadyPulled) {
			this.pull();
			// @ts-ignore
			window.__gitminiAlreadyPulled = true;
		}

		this.addCommand({
			id: 'git-mini-init',
			name: 'init',
			callback: async () => {
				try {
					await this.gitManager.init();
					new Notice('Created new repo');
				} catch (e) {
					if (e instanceof SettingsEmptyError) {
						new Notice(e.message);
						return;
					}
					if (e instanceof AlreadyHasGitError) {
						new Notice(e.message);
						return;
					}
					new Notice('Error on init');
					console.log(e);
				}
			}
		});
		this.addCommand({
			id: 'git-mini-clone',
			name: 'clone',
			callback: async () => {
				const cloneNotice = new Notice('Initiating Git clone', 0);
				try {
					await this.gitManager.clone({
						onProgress: (progress) => {
							cloneNotice.setMessage(
								`${progress.phase} ${progress.loaded}/${progress.total}`);
						},
					});
					cloneNotice.setMessage('Clone completed successfully');

				} catch (e) {
					if (e instanceof SettingsEmptyError) {
						cloneNotice.setMessage(e.message);
					} else if (e instanceof AlreadyHasGitError) {
						cloneNotice.setMessage(e.message);
					} else {
						cloneNotice.setMessage('Error on clone');
						console.log(e);
					}
				}
				setTimeout(
					() => cloneNotice.hide(),
					2000,
				);
			}
		});
		this.addCommand({
			id: 'git-mini-pull',
			icon: 'download',
			name: 'pull',
			callback: this.pull.bind(this),
		});
		this.addRibbonIcon(
			'download',
			'pull files',
			this.pull.bind(this),
		);
		this.addCommand({
			id: 'git-mini-backup',
			icon: 'archive',
			name: 'backup',
			callback: () => {
				const backupNotice = new Notice('Initiating backup', 0);
				this.backup(backupNotice);
				setTimeout(
					() => backupNotice.hide(),
					2000,
				);

			},
		});
		this.addRibbonIcon(
			'archive',
			'backup files',
			() => {
				const backupNotice = new Notice('Initiating backup', 0);
				this.backup(backupNotice);
				setTimeout(
					() => backupNotice.hide(),
					2000,
				);
			},
		);

		// for easy debug
		// will create ribbon icon for plugin reload
		//this.addRibbonIcon('refresh-ccw', 'Reload', () => {
		//	const pluginManager = this.app.plugins;
		//
		//	pluginManager.disablePlugin("gitsidian");
		//	pluginManager.enablePlugin("gitsidian");
		//
		//	new Notice("Reloaded");
		//});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new GitMiniSettingTab(this.app, this));

	}

	async onunload() {
		this.gitManager.clear();
	}

	async pull() {
		new Notice('Initiating Git pull');
		try {
			await this.gitManager.pull({});
			new Notice('Git pull completed successfully');
		} catch (e) {
			if (e instanceof SettingsEmptyError) {
				new Notice(e.message);
				return;
			}
			new Notice('Git pull failed');
			console.log(e);
		}
	}

	async backup(notification: Notice) {
		try {
			notification.setMessage('Initiating Git pull');
			const remoteInfo = await this.gitManager.pull({
				onProgress: (progress) => {
					notification.setMessage(progress.phase);
				},
			});

			notification.setMessage('Staging');
			const statusMatrix = await this.gitManager.statusMatrix();
			const isChangesStaged = await this.gitManager.stageAllChanges({
				matrix: statusMatrix,
				onProgress: (counter) => { notification.setMessage(`Staging files ${counter}`); },
			});
			if (!isChangesStaged) {

				const hasUnpushedCommits = await this.gitManager.hasChangesToPush(remoteInfo);
				if (hasUnpushedCommits) {
					notification.setMessage('Initiating Git push');
					const result = await this.gitManager.push();
					if (result.ok === true) {
						notification.setMessage('Backup completed successfully');
					} else {
						notification.setMessage('Backup failed');
						console.log(result);
					}
					return;

				}
				notification.setMessage('No changes to commit');
				return;
			}

			await this.gitManager.commit();

			notification.setMessage('Initiating Git push');
			const result = await this.gitManager.push();
			if (result.ok === true) {
				notification.setMessage('Backup completed successfully');
			} else {
				notification.setMessage('Backup failed');
				console.log(result);
			}

		} catch (e) {
			if (e instanceof SettingsEmptyError) {
				notification.setMessage(e.message);
				return;
			}
			notification.setMessage('Backup failed');
			console.log(e);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}


	async getPassword(): Promise<string | null> {
		return this.app.loadLocalStorage(this.prefix + "password");

	}
	async setPassword(value: string): Promise<void> {
		return this.app.saveLocalStorage(this.prefix + "password", value);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

