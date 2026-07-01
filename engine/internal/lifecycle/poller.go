package lifecycle

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/slievr/athene/engine/internal/store"
)

const defaultInterval = 30 * time.Second

type Poller struct {
	store    *store.Store
	interval time.Duration
	probe    *Prober
}

func NewPoller(st *store.Store, probe *Prober, interval time.Duration) *Poller {
	if interval == 0 {
		interval = defaultInterval
	}
	return &Poller{store: st, interval: interval, probe: probe}
}

func (p *Poller) Start(ctx context.Context) {
	ticker := time.NewTicker(p.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.pollAll(ctx)
		}
	}
}

func (p *Poller) pollAll(ctx context.Context) {
	sessions, err := p.store.ListSessions("")
	if err != nil {
		log.Error().Err(err).Msg("list sessions for poll")
		return
	}

	var wg sync.WaitGroup
	for _, sess := range sessions {
		if isTerminal(sess) {
			continue
		}
		wg.Add(1)
		go func(s *store.Session) {
			defer wg.Done()
			if err := p.probe.PollSession(ctx, s); err != nil {
				log.Error().Err(err).Str("session", s.ID).Msg("poll session")
			}
		}(sess)
	}
	wg.Wait()
}

func isTerminal(s *store.Session) bool {
	var lc struct {
		Session struct {
			State string `json:"state"`
		} `json:"session"`
	}
	if err := json.Unmarshal(s.Lifecycle, &lc); err != nil {
		return false
	}
	return lc.Session.State == "done" || lc.Session.State == "terminated"
}
