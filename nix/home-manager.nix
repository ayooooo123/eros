{ self }:
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.programs.eros;
  yaml = pkgs.formats.yaml { };
in
{
  options.programs.eros = {
    enable = lib.mkEnableOption "LYCORPEROS coding agent";

    package = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
      defaultText = lib.literalExpression "inputs.eros.packages.${pkgs.stdenv.hostPlatform.system}.default";
      description = "LYCORPEROS package to install.";
    };

    settings = lib.mkOption {
      type = lib.types.nullOr yaml.type;
      default = null;
      description = ''
        Settings written declaratively to {file}`~/.eros/agent/config.yml`.
        The file is a read-only store symlink: changes made from inside EROS
        (`/settings`, onboarding) replace it but revert on the next
        `home-manager switch`.
      '';
      example = {
        theme.dark = "lycorperos";
        startup.quiet = true;
      };
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ cfg.package ];
    home.file.".eros/agent/config.yml" = lib.mkIf (cfg.settings != null) {
      source = yaml.generate "eros-config.yml" cfg.settings;
    };
  };
}
