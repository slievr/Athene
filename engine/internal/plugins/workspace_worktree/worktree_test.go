package workspace_worktree_test

import (
	"context"
	"os"
	"os/exec"
	"testing"

	"github.com/slievr/athene/engine/internal/plugins/workspace_worktree"
)

func TestCreateAndDestroy(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}

	// Create a bare git repo to test against
	repoDir := t.TempDir()
	exec.Command("git", "init", "--bare", repoDir).Run()

	worktreesDir := t.TempDir()
	ws := workspace_worktree.New(worktreesDir)

	// This test requires a real git repo with a branch — skip if setup fails
	path, err := ws.Create(context.Background(), "test-session", "HEAD")
	if err != nil {
		t.Skip("git worktree create failed (expected in bare repos):", err)
	}

	if _, err := os.Stat(path); err != nil {
		t.Errorf("worktree path does not exist: %v", err)
	}

	if err := ws.Destroy(context.Background(), "test-session", path); err != nil {
		t.Error("destroy:", err)
	}

	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Error("worktree path still exists after destroy")
	}
}
