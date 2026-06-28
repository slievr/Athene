package lifecycle

import (
	"context"
	"encoding/json"

	"github.com/slievr/athene/engine/internal/plugin"
	"github.com/slievr/athene/engine/internal/store"
)

type Prober struct {
	agentAdapters map[string]*plugin.Adapter // keyed by plugin name
}

func NewProber(adapters map[string]*plugin.Adapter) *Prober {
	return &Prober{agentAdapters: adapters}
}

func (p *Prober) PollSession(ctx context.Context, sess *store.Session) error {
	// 1. Get the agent plugin name from session metadata or config
	agentName, _ := sess.KV["agentPlugin"]
	adapter, ok := p.agentAdapters[agentName]
	if !ok {
		return nil
	}

	// 2. Check process liveness
	result, err := adapter.Call("isProcessRunning", map[string]any{
		"sessionId":     sess.ID,
		"runtimeHandle": json.RawMessage(sess.RuntimeHandle),
	})
	if err != nil {
		return err
	}

	var running bool
	if err := json.Unmarshal(result, &running); err != nil {
		return err
	}

	if !running {
		// Transition to detecting/terminated — update lifecycle in store
		// Full implementation reads current lifecycle, applies transition, writes back
	}

	return nil
}
