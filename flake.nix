{
  description = "skavex — server-rendered Markdown + LaTeX for Svelte";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      # No x86_64-darwin: nixos-unstable deprecated it and it throws on eval,
      # which would fail `nix flake check --all-systems` for every contributor.
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];

      forAllSystems = fn: nixpkgs.lib.genAttrs systems (system: fn nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (pkgs: {
        # The whole toolchain, so CI and a contributor's machine cannot drift:
        # .forgejo/workflows/ci.yml runs every check through `nix develop -c`.
        # Node 26, the newest release line. package.json's engines field stays
        # wider than this on purpose: consumers pick their own version, this is
        # only what skavex is developed and tested against.
        default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_26
            pkgs.pnpm
          ];
        };
      });

      formatter = forAllSystems (pkgs: pkgs.nixfmt);
    };
}
