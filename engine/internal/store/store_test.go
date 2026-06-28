package store_test

import (
	"path/filepath"
	"testing"

	"github.com/slievr/athene/engine/internal/store"
)

func TestOpenAndList(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	sessions, err := st.ListSessions("")
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 0 {
		t.Errorf("expected 0 sessions, got %d", len(sessions))
	}
}

func TestGetNonexistent(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	sess, err := st.GetSession("does-not-exist")
	if err != nil {
		t.Fatal(err)
	}
	if sess != nil {
		t.Errorf("expected nil, got %+v", sess)
	}
}
