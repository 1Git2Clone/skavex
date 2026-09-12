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
        # Node 22 is the oldest LTS still in nixpkgs — 20 went EOL 2026-04-30
        # and now throws on eval.
        default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_22
            pkgs.pnpm
          ];
        };
      });

      formatter = forAllSystems (pkgs: pkgs.nixfmt);
    };
}
