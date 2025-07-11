import { App, PluginSettingTab, Setting } from "obsidian";
import Gitsidian from "src/main";

export class GitMiniSettingTab extends PluginSettingTab {
	plugin: Gitsidian;

	constructor(app: App, plugin: Gitsidian) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Repository url')
			.setDesc('Repository to manage')
			.addText(text => text
				.setPlaceholder('Enter your repo url')
				.setValue(this.plugin.settings.repositoryUrl ?? '')
				.onChange(async (value) => {
					this.plugin.settings.repositoryUrl = value.trim();
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Branch')
			.setDesc('Which branch to manage')
			.addText(text => text
				.setPlaceholder('Enter your branch')
				.setValue(this.plugin.settings.gitBranch ?? '')
				.onChange(async (value) => {
					this.plugin.settings.gitBranch = value.trim();
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Email')
			.setDesc('Email for signing commits')
			.addText(text => text
				.setPlaceholder('Enter your email for git')
				.setValue(this.plugin.settings.email ?? '')
				.onChange(async (value) => {
					this.plugin.settings.email = value.trim();
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Username')
			.setDesc('Username for authentification')
			.addText(text => text
				.setPlaceholder('Enter your username')
				.setValue(this.plugin.settings.username ?? '')
				.onChange(async (value) => {
					this.plugin.settings.username = value.trim();
					await this.plugin.saveSettings();
				}));
		const tokenDescription = new DocumentFragment();
		let tokenText = document.createElement('span')
		tokenText.innerHTML = `Access token for authentification<br>
		Will be empty afterwards`;
		tokenDescription.appendChild(tokenText);
		new Setting(containerEl)
			.setName('Access token')
			.setDesc(tokenDescription)
			.addText(text => text
				.setValue('')
				.onChange(async (value) => {
					this.plugin.setPassword(value.trim());
				}));

		const linkTemplateDescription = new DocumentFragment();
		let linkTemplateText = document.createElement('span')
		linkTemplateText.innerHTML = `Template for the commit message<br><br>
		Available variables:<br>
		- {{date}}`;
		linkTemplateDescription.appendChild(linkTemplateText);
		new Setting(containerEl)
			.setName('Commit message')
			.setDesc(linkTemplateDescription)
			.addTextArea((text) => {
				text
					.setPlaceholder("Example: backup from obsidian {{date:YYYY-MM-DD-HH:mm}}")
					.setValue(this.plugin.settings.commitTemplate || '')
					.onChange(async (value) => {
						this.plugin.settings.commitTemplate = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 3;
				text.inputEl.cols = 22;
			});

		new Setting(containerEl)
			.setName('Auto pull on obsidian start up')
			.addToggle((tg) => {
				tg
					.setValue(this.plugin.settings.autoPullOnBoot)
					.onChange(async (value) => {
						this.plugin.settings.autoPullOnBoot = value;
						await this.plugin.saveSettings();
					});
			});

	}
}
