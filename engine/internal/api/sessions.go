package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/slievr/athene/engine/internal/store"
)

func RegisterSessionRoutes(r chi.Router, st *store.Store) {
	r.Get("/api/sessions", listSessions(st))
	r.Get("/api/sessions/{id}", getSession(st))
}

func listSessions(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		projectID := r.URL.Query().Get("projectId")
		sessions, err := st.ListSessions(projectID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if sessions == nil {
			sessions = []*store.Session{}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(sessions)
	}
}

func getSession(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		sess, err := st.GetSession(id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if sess == nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(sess)
	}
}
