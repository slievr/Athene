package plugin

import "context"

type Slot string

const (
	SlotRuntime   Slot = "runtime"
	SlotAgent     Slot = "agent"
	SlotWorkspace Slot = "workspace"
	SlotTracker   Slot = "tracker"
	SlotSCM       Slot = "scm"
	SlotNotifier  Slot = "notifier"
	SlotTerminal  Slot = "terminal"
)

type Manifest struct {
	Name        string `json:"name"`
	Slot        Slot   `json:"slot"`
	Version     string `json:"version"`
	Description string `json:"description"`
}

// Runtime is the Go equivalent of the TypeScript Runtime plugin interface.
type Runtime interface {
	Send(ctx context.Context, sessionID string, handle any, message string) error
	Kill(ctx context.Context, sessionID string, handle any) error
	IsAlive(ctx context.Context, sessionID string, handle any) (bool, error)
}

// Workspace is the Go equivalent of the TypeScript Workspace plugin interface.
type Workspace interface {
	Create(ctx context.Context, sessionID string, branch string) (string, error) // returns workspacePath
	Destroy(ctx context.Context, sessionID string, workspacePath string) error
}

type GoPlugin[T any] struct {
	Manifest Manifest
	Create   func(config map[string]any) T
}
