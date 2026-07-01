package runtime_tmux_test

import (
	"context"
	"os/exec"
	"testing"

	"github.com/slievr/athene/engine/internal/plugins/runtime_tmux"
)

func TestIsAlive_NoTmux(t *testing.T) {
	if _, err := exec.LookPath("tmux"); err != nil {
		t.Skip("tmux not available")
	}

	rt := runtime_tmux.New()
	alive, err := rt.IsAlive(context.Background(), "nonexistent-session-xyz", nil)
	if err != nil {
		t.Fatal(err)
	}
	if alive {
		t.Error("expected not alive for nonexistent session")
	}
}
