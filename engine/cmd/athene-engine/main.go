package main

import (
	"context"
	"flag"
	"fmt"
	"net/http"
	"os"
	"path/filepath"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/slievr/athene/engine/internal/api"
	"github.com/slievr/athene/engine/internal/lifecycle"
	"github.com/slievr/athene/engine/internal/plugin"
	"github.com/slievr/athene/engine/internal/store"
)

func main() {
	dbPath := flag.String("db", "", "Path to athene.db (required)")
	port := flag.Int("port", 3030, "Port to listen on")
	flag.Parse()

	if *dbPath == "" {
		fmt.Fprintln(os.Stderr, "-db is required")
		os.Exit(1)
	}

	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	abs, err := filepath.Abs(*dbPath)
	if err != nil {
		log.Fatal().Err(err).Msg("resolve db path")
	}

	st, err := store.Open(abs)
	if err != nil {
		log.Fatal().Err(err).Msg("open store")
	}
	defer st.Close()

	ctx := context.Background()

	prober := lifecycle.NewProber(map[string]*plugin.Adapter{})
	poller := lifecycle.NewPoller(st, prober, 0)
	go poller.Start(ctx)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	api.RegisterSessionRoutes(r, st)

	addr := fmt.Sprintf(":%d", *port)
	log.Info().Str("addr", addr).Msg("athene-engine starting")
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatal().Err(err).Msg("server failed")
	}
}
