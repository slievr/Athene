package workspace_worktree

import (
	"context"
	"fmt"
	"os/exec"
	"path/filepath"

	"github.com/slievr/athene/engine/internal/plugin"
)

type worktreeWorkspace struct {
	baseDir string // e.g. ~/.agent-orchestrator/{hash}/worktrees
}

var _ plugin.Workspace = (*worktreeWorkspace)(nil)

func New(baseDir string) plugin.Workspace {
	return &worktreeWorkspace{baseDir: baseDir}
}

func (w *worktreeWorkspace) Create(ctx context.Context, sessionID string, branch string) (string, error) {
	path := filepath.Join(w.baseDir, sessionID)
	cmd := exec.CommandContext(ctx, "git", "worktree", "add", path, branch)
	if out, err := cmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("git worktree add: %w\n%s", err, out)
	}
	return path, nil
}

func (w *worktreeWorkspace) Destroy(ctx context.Context, _ string, workspacePath string) error {
	cmd := exec.CommandContext(ctx, "git", "worktree", "remove", "--force", workspacePath)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git worktree remove: %w\n%s", err, out)
	}
	return nil
}

var Manifest = plugin.Manifest{
	Name:        "worktree",
	Slot:        plugin.SlotWorkspace,
	Version:     "0.1.0",
	Description: "git worktree workspace (Go native)",
}

func Plugin(baseDir string) plugin.GoPlugin[plugin.Workspace] {
	return plugin.GoPlugin[plugin.Workspace]{
		Manifest: Manifest,
		Create:   func(_ map[string]any) plugin.Workspace { return New(baseDir) },
	}
}
