
export interface GitMiniSettings {
	repositoryUrl: string | undefined;
	username: string | undefined;
	email: string | undefined;
	accessToken: string | undefined;
	gitBranch: string | undefined;
	autoPullOnBoot: boolean;
	commitTemplate: string;
}

export const DEFAULT_SETTINGS: GitMiniSettings = {
	repositoryUrl: undefined,
	username: undefined,
	email: undefined,
	accessToken: undefined,
	gitBranch: undefined,
	autoPullOnBoot: false,
	commitTemplate: '',
}
