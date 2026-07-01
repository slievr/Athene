# This file is auto-updated by .github/workflows/release-native-app.yml on each release.
# To install via Homebrew:
#
#   brew tap made-by-moonlight/tap
#   brew install athene-app
#
# Or in one command:
#   brew install made-by-moonlight/tap/athene-app
#
# Setup: create a repo named 'homebrew-tap' under the Made-by-Moonlight org and place
# this file at Formula/athene-app.rb — Homebrew discovers it automatically.

class AtheneApp < Formula
  desc "Native desktop app for Athene — GPU-accelerated agent supervision"
  homepage "https://github.com/Made-by-Moonlight/Athene"
  version "0.0.0"  # replaced by release workflow
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/Made-by-Moonlight/Athene/releases/download/v#{version}/athene-app-aarch64-apple-darwin.tar.gz"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    else
      url "https://github.com/Made-by-Moonlight/Athene/releases/download/v#{version}/athene-app-x86_64-apple-darwin.tar.gz"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/Made-by-Moonlight/Athene/releases/download/v#{version}/athene-app-aarch64-unknown-linux-gnu.tar.gz"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    else
      url "https://github.com/Made-by-Moonlight/Athene/releases/download/v#{version}/athene-app-x86_64-unknown-linux-gnu.tar.gz"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    end
  end

  def install
    bin.install "athene-app"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/athene-app --version")
  end
end
