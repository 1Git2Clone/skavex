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
            # Browsers for the Playwright suite. Taken from nixpkgs rather than
            # `playwright install`, which downloads prebuilt binaries that do
            # not run on NixOS — and which CI would re-download every run,
            # since the runner keeps no cache.
            pkgs.playwright-driver.browsers
            # The documentation book. A Rust binary, so it comes from here
            # rather than from package.json — there is no npm mdbook worth
            # having, and pinning it with the rest of the toolchain means the
            # book CI builds is the book a contributor previews.
            pkgs.mdbook
          ];

          # The two variables that make @playwright/test use the browsers above
          # instead of looking for its own under ~/.cache. The npm package's
          # version has to match pkgs.playwright-driver, or it refuses the
          # revision it finds; package.json pins it exactly for that reason.
          env = {
            PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
            PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
          };
        };
      });

      formatter = forAllSystems (pkgs: pkgs.nixfmt);
    };
}
