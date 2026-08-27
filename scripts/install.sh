#!/bin/sh
set -e

# EROS local-fork installer
# Usage: ./scripts/install.sh [--source|--binary]
#
# Options:
#   --source       Build and install the checkout through Bun
#   --binary       Install an already built local EROS binary
#   --ref <ref>    Rejected: this private incarnation has no public release remote
#   -r <ref>       Shorthand for --ref

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
CHECKOUT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
INSTALL_DIR="${PI_INSTALL_DIR:-$HOME/.local/bin}"
LOCAL_BINARY="$CHECKOUT_ROOT/packages/coding-agent/dist/eros-omp"
MIN_BUN_VERSION="1.4.0"

MODE=""
REF=""
while [ $# -gt 0 ]; do
    case "$1" in
        --source)
            MODE="source"
            shift
            ;;
        --binary)
            MODE="binary"
            shift
            ;;
        --ref)
            shift
            if [ -z "$1" ]; then
                echo "Missing value for --ref"
                exit 1
            fi
            REF="$1"
            shift
            ;;
        --ref=*)
            REF="${1#*=}"
            if [ -z "$REF" ]; then
                echo "Missing value for --ref"
                exit 1
            fi
            shift
            ;;
        -r)
            shift
            if [ -z "$1" ]; then
                echo "Missing value for -r"
                exit 1
            fi
            REF="$1"
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

if [ -n "$REF" ] && [ -z "$MODE" ]; then
    MODE="source"
fi

has_bun() {
    command -v bun >/dev/null 2>&1
}

host_arch() {
    if [ "$(uname -s)" = "Darwin" ]; then
        if [ "$(sysctl -in hw.optional.arm64 2>/dev/null || /usr/sbin/sysctl -in hw.optional.arm64 2>/dev/null)" = "1" ]; then
            echo "arm64"
        else
            echo "x64"
        fi
        return
    fi
    case "$(uname -m)" in
        x86_64|amd64)  echo "x64" ;;
        arm64|aarch64) echo "arm64" ;;
        *)             uname -m ;;
    esac
}

bun_arch() {
    bun -e 'process.stdout.write(process.arch)' 2>/dev/null
}

bun_arch_matches_host() {
    ba="$(bun_arch)"
    [ -z "$ba" ] && return 0
    [ "$ba" = "$(host_arch)" ]
}

version_ge() {
    current="$1"
    minimum="$2"

    current_major="${current%%.*}"
    current_rest="${current#*.}"
    current_minor="${current_rest%%.*}"
    current_patch="${current_rest#*.}"
    current_patch="${current_patch%%.*}"

    minimum_major="${minimum%%.*}"
    minimum_rest="${minimum#*.}"
    minimum_minor="${minimum_rest%%.*}"
    minimum_patch="${minimum_rest#*.}"
    minimum_patch="${minimum_patch%%.*}"

    if [ "$current_major" -ne "$minimum_major" ]; then
        [ "$current_major" -gt "$minimum_major" ]
        return $?
    fi
    if [ "$current_minor" -ne "$minimum_minor" ]; then
        [ "$current_minor" -gt "$minimum_minor" ]
        return $?
    fi
    [ "$current_patch" -ge "$minimum_patch" ]
}

require_bun_version() {
    version_raw=$(bun --version 2>/dev/null || true)
    if [ -z "$version_raw" ]; then
        echo "Failed to read Bun version"
        exit 1
    fi
    version_clean=${version_raw%%-*}
    if ! version_ge "$version_clean" "$MIN_BUN_VERSION"; then
        echo "Bun ${MIN_BUN_VERSION} or newer is required. Current version: ${version_clean}"
        echo "Upgrade Bun at https://bun.sh/docs/installation"
        exit 1
    fi
}

install_bun() {
    echo "Installing Bun..."
    if command -v bash >/dev/null 2>&1; then
        curl -fsSL https://bun.sh/install | bash
    else
        curl -fsSL https://bun.sh/install | sh
    fi
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    require_bun_version
}

reject_ref() {
    if [ -n "$REF" ]; then
        echo "EROS has no public release remote; check out the desired ref locally, then rerun without --ref."
        exit 1
    fi
}

install_via_bun() {
    reject_ref
    if [ ! -d "$CHECKOUT_ROOT/packages/coding-agent" ]; then
        echo "Run this installer from a complete EROS checkout."
        exit 1
    fi
    echo "Building and installing EROS from $CHECKOUT_ROOT..."
    (cd "$CHECKOUT_ROOT" && bun install --frozen-lockfile && bun run build:native)
    (cd "$CHECKOUT_ROOT/packages/coding-agent" && bun run build)
    mkdir -p "$INSTALL_DIR"
    cp "$LOCAL_BINARY" "${INSTALL_DIR}/eros"
    chmod +x "${INSTALL_DIR}/eros"
    echo "EROS is installed at ${INSTALL_DIR}/eros"
}

install_binary() {
    reject_ref
    if [ ! -x "$LOCAL_BINARY" ]; then
        echo "No built EROS binary was found at $LOCAL_BINARY"
        echo "Run './scripts/install.sh --source' to build and install it."
        exit 1
    fi
    mkdir -p "$INSTALL_DIR"
    cp "$LOCAL_BINARY" "${INSTALL_DIR}/eros"
    chmod +x "${INSTALL_DIR}/eros"
    if ! "${INSTALL_DIR}/eros" --version >/dev/null 2>&1; then
        echo "EROS was copied to ${INSTALL_DIR}/eros but could not start."
        exit 1
    fi
    echo "EROS is installed at ${INSTALL_DIR}/eros"
}

case "$MODE" in
    source)
        if ! has_bun; then install_bun; fi
        require_bun_version
        if ! bun_arch_matches_host; then
            echo "Error: Bun reports architecture '$(bun_arch)' but this host is '$(host_arch)'."
            echo "Install a native Bun before building EROS from source."
            exit 1
        fi
        install_via_bun
        ;;
    binary)
        install_binary
        ;;
    *)
        if [ -x "$LOCAL_BINARY" ]; then
            install_binary
        else
            if ! has_bun; then install_bun; fi
            require_bun_version
            if ! bun_arch_matches_host; then
                echo "Error: Bun reports architecture '$(bun_arch)' but this host is '$(host_arch)'."
                exit 1
            fi
            install_via_bun
        fi
        ;;
esac
