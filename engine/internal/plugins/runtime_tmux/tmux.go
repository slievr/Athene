package runtime_tmux

import (
	"context"
	"fmt"
	"os/exec"
	"strings"

	"github.com/slievr/athene/engine/internal/plugin"
)

type tmuxRuntime struct{}

var _ plugin.Runtime = (*tmuxRuntime)(nil)

func New() plugin.Runtime {
	return &tmuxRuntime{}
}

func (t *tmuxRuntime) Send(ctx context.Context, sessionID string, _ any, message string) error {
	return exec.CommandContext(ctx, "tmux", "send-keys", "-t", sessionName(sessionID), message, "Enter").Run()
}

func (t *tmuxRuntime) Kill(ctx context.Context, sessionID string, _ any) error {
	return exec.CommandContext(ctx, "tmux", "kill-session", "-t", sessionName(sessionID)).Run()
}

func (t *tmuxRuntime) IsAlive(ctx context.Context, sessionID string, _ any) (bool, error) {
	out, err := exec.CommandContext(ctx, "tmux", "list-sessions", "-F", "#{session_name}").Output()
	if err != nil {
		return false, nil // tmux not running = session not alive
	}
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line == sessionName(sessionID) {
			return true, nil
		}
	}
	return false, nil
}

// Manifest for plugin registration
var Manifest = plugin.Manifest{
	Name:        "tmux",
	Slot:        plugin.SlotRuntime,
	Version:     "0.1.0",
	Description: "tmux session runtime (Go native)",
}

func Plugin() plugin.GoPlugin[plugin.Runtime] {
	return plugin.GoPlugin[plugin.Runtime]{
		Manifest: Manifest,
		Create:   func(_ map[string]any) plugin.Runtime { return New() },
	}
}

func sessionName(sessionID string) string {
	return fmt.Sprintf("ao-%s", sessionID)
}
