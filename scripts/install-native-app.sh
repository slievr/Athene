#!/usr/bin/env bash
# Install the athene-app native binary.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/slievr/Athene/main/scripts/install-native-app.sh | sh
#
# Environment variables:
#   ATHENE_VERSION    Pin a specific release tag, e.g. ATHENE_VERSION=v0.14.0
#   ATHENE_INSTALL_DIR  Override install directory (default: /usr/local/bin or ~/.local/bin)

set -euo pipefail

REPO="slievr/Athene"
BINARY="athene-app"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

info()  { printf "${GREEN}[athene]${NC} %s\n" "$*"; }
warn()  { printf "${YELLOW}[athene]${NC} %s\n" "$*"; }
error() { printf "${RED}[athene] error:${NC} %s\n" "$*" >&2; exit 1; }

# ── Detect platform ────────────────────────────────────────────────────────────
OS=$(uname -s)
ARCH=$(uname -m)

case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64)  TARGET="aarch64-apple-darwin" ;;
      x86_64) TARGET="x86_64-apple-darwin"  ;;
      *)      error "Unsupported macOS architecture: $ARCH" ;;
    esac
    ;;
  Linux)
    case "$ARCH" in
      x86_64)          TARGET="x86_64-unknown-linux-gnu"  ;;
      aarch64|arm64)   TARGET="aarch64-unknown-linux-gnu" ;;
      *)               error "Unsupported Linux architecture: $ARCH" ;;
    esac
    ;;
  *)
    error "Unsupported operating system: $OS (Windows is not yet supported)"
    ;;
esac

# ── Resolve version ────────────────────────────────────────────────────────────
if [ -n "${ATHENE_VERSION:-}" ]; then
  VERSION="$ATHENE_VERSION"
  info "Installing pinned version $VERSION"
else
  info "Fetching latest release..."
  VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' | sed 's/.*"tag_name": "\(.*\)".*/\1/')
  [ -n "$VERSION" ] || error "Could not determine latest release tag"
  info "Latest release: $VERSION"
fi

# ── Download ───────────────────────────────────────────────────────────────────
TARBALL="${BINARY}-${TARGET}.tar.gz"
URL="https://github.com/${REPO}/releases/download/${VERSION}/${TARBALL}"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

info "Downloading ${BINARY} ${VERSION} for ${TARGET}..."
if command -v curl >/dev/null 2>&1; then
  curl -fsSL --progress-bar "$URL" -o "$TMP/$TARBALL"
elif command -v wget >/dev/null 2>&1; then
  wget -q --show-progress "$URL" -O "$TMP/$TARBALL"
else
  error "Neither curl nor wget found — install one and retry"
fi

tar -xzf "$TMP/$TARBALL" -C "$TMP"
[ -f "$TMP/$BINARY" ] || error "Binary not found in tarball"

# ── Install ────────────────────────────────────────────────────────────────────
if [ -n "${ATHENE_INSTALL_DIR:-}" ]; then
  INSTALL_DIR="$ATHENE_INSTALL_DIR"
elif [ -w /usr/local/bin ]; then
  INSTALL_DIR=/usr/local/bin
elif [ -d "$HOME/.local/bin" ] || mkdir -p "$HOME/.local/bin" 2>/dev/null; then
  INSTALL_DIR="$HOME/.local/bin"
else
  error "Cannot find a writable install directory. Set ATHENE_INSTALL_DIR to override."
fi

install -m 755 "$TMP/$BINARY" "$INSTALL_DIR/$BINARY"
info "Installed ${BINARY} ${VERSION} → ${INSTALL_DIR}/${BINARY}"

# ── PATH hint ─────────────────────────────────────────────────────────────────
if ! command -v "$BINARY" >/dev/null 2>&1; then
  warn "  ${INSTALL_DIR} is not on your PATH."
  warn "  Add it:  export PATH=\"${INSTALL_DIR}:\$PATH\""
fi

info "Run:  ${BINARY} --help"
