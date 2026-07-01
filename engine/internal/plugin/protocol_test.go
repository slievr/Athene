package plugin_test

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/slievr/athene/engine/internal/plugin"
)

func TestAdapterCall(t *testing.T) {
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node not found in PATH")
	}

	// Write a minimal Node.js echo adapter
	script := `
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', line => {
  const req = JSON.parse(line);
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: true }) + '\n');
});
`
	dir := t.TempDir()
	scriptPath := filepath.Join(dir, "echo.js")
	if err := os.WriteFile(scriptPath, []byte(script), 0644); err != nil {
		t.Fatal(err)
	}

	adapter, err := plugin.NewAdapter(scriptPath)
	if err != nil {
		t.Fatal(err)
	}
	defer adapter.Close()

	result, err := adapter.Call("isProcessRunning", map[string]string{"sessionId": "test"})
	if err != nil {
		t.Fatal(err)
	}

	var val bool
	if err := json.Unmarshal(result, &val); err != nil {
		t.Fatal(err)
	}
	if !val {
		t.Error("expected true")
	}
}
