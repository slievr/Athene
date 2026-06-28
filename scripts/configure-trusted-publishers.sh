#!/usr/bin/env bash
# Configure Trusted Publishing (OIDC) for all @made-by-moonlight/athene-* packages.
#
# Both stable and canary releases are published by release.yml, so only
# this one workflow file needs to be registered as a trusted publisher.
#
# Usage:
#   ./scripts/configure-trusted-publishers.sh
#
# Prerequisites:
#   - npm >= 11.10.0  (npm --version to check)
#   - Logged in as the package owner: npm whoami
#   - 2FA enabled on your npmjs.com account
#
# The first package will open a browser tab for 2FA. When prompted,
# tick "Skip 2FA for the next 5 minutes" before approving — this lets
# the remaining ~29 packages run without further interruptions.
# A 2-second sleep between calls avoids rate limiting.

set -euo pipefail

REPO="slievr/Athene"
FILE="release.yml"

PACKAGES=(
  "@made-by-moonlight/athene"
  "@made-by-moonlight/athene-cli"
  "@made-by-moonlight/athene-core"
  "@made-by-moonlight/athene-web"
  "@made-by-moonlight/athene-notifier-macos"
  "@made-by-moonlight/athene-plugin-agent-aider"
  "@made-by-moonlight/athene-plugin-agent-claude-code"
  "@made-by-moonlight/athene-plugin-agent-codex"
  "@made-by-moonlight/athene-plugin-agent-cursor"
  "@made-by-moonlight/athene-plugin-agent-grok"
  "@made-by-moonlight/athene-plugin-agent-kimicode"
  "@made-by-moonlight/athene-plugin-agent-opencode"
  "@made-by-moonlight/athene-plugin-notifier-composio"
  "@made-by-moonlight/athene-plugin-notifier-dashboard"
  "@made-by-moonlight/athene-plugin-notifier-desktop"
  "@made-by-moonlight/athene-plugin-notifier-discord"
  "@made-by-moonlight/athene-plugin-notifier-openclaw"
  "@made-by-moonlight/athene-plugin-notifier-slack"
  "@made-by-moonlight/athene-plugin-notifier-webhook"
  "@made-by-moonlight/athene-plugin-runtime-process"
  "@made-by-moonlight/athene-plugin-runtime-tmux"
  "@made-by-moonlight/athene-plugin-scm-github"
  "@made-by-moonlight/athene-plugin-scm-gitlab"
  "@made-by-moonlight/athene-plugin-terminal-iterm2"
  "@made-by-moonlight/athene-plugin-terminal-web"
  "@made-by-moonlight/athene-plugin-tracker-github"
  "@made-by-moonlight/athene-plugin-tracker-gitlab"
  "@made-by-moonlight/athene-plugin-tracker-linear"
  "@made-by-moonlight/athene-plugin-workspace-clone"
  "@made-by-moonlight/athene-plugin-workspace-worktree"
)

echo "==> Configuring Trusted Publishing for ${#PACKAGES[@]} packages"
echo "    repo: ${REPO}  file: ${FILE}"
echo ""
echo "NOTE: The first package will open a browser tab for 2FA."
echo "      Tick 'Skip 2FA for the next 5 minutes' before approving."
echo ""

FIRST=true
FAILED=()

for pkg in "${PACKAGES[@]}"; do
  echo -n "  configuring ${pkg} ... "

  if $FIRST; then
    # First call: interactive — browser 2FA will be required
    FIRST=false
    if npm trust github "$pkg" \
        --repo "$REPO" \
        --file "$FILE" \
        --allow-publish; then
      echo "ok"
    else
      echo "FAILED"
      FAILED+=("$pkg")
    fi
  else
    # Subsequent calls: --yes skips the confirmation prompt;
    # the 5-minute 2FA skip window handles authentication.
    if npm trust github "$pkg" \
        --repo "$REPO" \
        --file "$FILE" \
        --allow-publish \
        --yes; then
      echo "ok"
    else
      echo "FAILED"
      FAILED+=("$pkg")
    fi
    sleep 2
  fi
done

echo ""
if [ ${#FAILED[@]} -eq 0 ]; then
  echo "==> All ${#PACKAGES[@]} packages configured successfully."
else
  echo "==> Done. The following packages FAILED and need to be retried:"
  for pkg in "${FAILED[@]}"; do
    echo "    npm trust github ${pkg} --repo ${REPO} --file ${FILE} --allow-publish --yes"
  done
fi
