{
  description = "Dev obsidian extension";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-unstable";
  };

  outputs = { self, nixpkgs }: 
  let
    system = "x86_64-linux";
    pkgs = import nixpkgs {
		system = "x86_64-linux";
		config.allowUnfree = true;
	};
  in 
  {

    devShells.${system}.default = pkgs.mkShell {
      name = "obsidian-git-mini";
      buildInputs = with pkgs; [
		nodejs_22
		obsidian
      ];
      shellHook = ''
		session="obsidian-git-mini"
        sessioExist=$(tmux list-sessions | grep $session)

        if [ "$sessioExist" != "" ]; then
            tmux kill-session -t $session
        fi
        window=0

		#tmux -L $session # make it able to inherit the shell variable

        tmux new-session -d -s $session

        tmux set -g mouse on
        tmux set -g mouse-select-window on

		tmux send-keys -t $session 'npm run dev' C-m

        tmux split-window -h -t $session
		tmux send-keys -t $session 'obsidian' C-m

		tmux new-window
		tmux send-keys -t $session 'nvim ./src/main.ts' C-m

        tmux attach-session -t $session

      '';
    };

  };
}

