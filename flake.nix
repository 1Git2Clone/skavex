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
            #
            # -chromium, not the full set. playwright.config.js declares one
            # project and says why, so firefox and webkit were closure the suite
            # never launched — and on a cacheless runner that closure is paid
            # for on every single push. It is also a liability: nixos-unstable
            # currently ships a playwright-webkit that fails auto-patchelf on a
            # missing libmanette, which took the whole dev shell down with it.
            pkgs.playwright-driver.browsers-chromium
            # Fonts. The job container ships none, and a Chromium with no fonts
            # at all does not fall back to something narrower — it lays text out
            # with zero metrics, so every box sized by its text collapses to
            # height 0. The page still "renders"; it is simply not a page. Any
            # browser assertion about layout measures a fiction without this.
            pkgs.dejavu_fonts
            # The documentation book. A Rust binary, so it comes from here
            # rather than from package.json — there is no npm mdbook worth
            # having, and pinning it with the rest of the toolchain means the
            # book CI builds is the book a contributor previews.
            pkgs.mdbook
            # The hook runner. `pre-commit install` once per clone, after which
            # .pre-commit-config.yaml is enforced on every commit; CI runs the
            # same file, so the two cannot drift.
            pkgs.pre-commit
            pkgs.gitleaks
          ];

          # The two variables that make @playwright/test use the browsers above
          # instead of looking for its own under ~/.cache. The npm package's
          # version has to match pkgs.playwright-driver, or it refuses the
          # revision it finds; package.json pins it exactly for that reason.
          env = {
            PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers-chromium}";
            PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
            # Chromium finds fonts through fontconfig, which looks in the host's
            # directories — none of which exist in the runner's container. This
            # points it at the font above instead.
            FONTCONFIG_FILE = pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts ]; };
          };
        };

        # Renovate, for `renovate-config-validator` alone.
        #
        # Its own shell rather than an entry in `default`, for the reason
        # hutao/vps splits it the same way: Renovate is a large node
        # application, and putting it in the shell every CI run enters would
        # download that closure on every push for a validator that only matters
        # when renovate.json5 changes. The pre-push hook that uses it is scoped
        # to that file, so the cost falls on whoever edits it.
        #
        #   nix develop .#renovate -c renovate-config-validator
        #
        # The bot itself runs from hutao/vps, which is where the schedule, the
        # token and the autodiscover settings live; this repo only carries its
        # own repository config.
        renovate = pkgs.mkShell { packages = [ pkgs.renovate ]; };
      });

      formatter = forAllSystems (pkgs: pkgs.nixfmt);
    };
}
