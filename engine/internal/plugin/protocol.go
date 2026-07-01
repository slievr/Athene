package plugin

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os/exec"
	"sync"
	"sync/atomic"
)

type request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int64           `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

type response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int64           `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// Adapter wraps a long-running Node.js plugin subprocess.
type Adapter struct {
	cmd     *exec.Cmd
	enc     *json.Encoder
	dec     *json.Decoder
	mu      sync.Mutex
	nextID  atomic.Int64
	pending map[int64]chan *response
}

func NewAdapter(nodeScript string) (*Adapter, error) {
	cmd := exec.Command("node", nodeScript)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start adapter: %w", err)
	}

	a := &Adapter{
		cmd:     cmd,
		enc:     json.NewEncoder(stdin),
		dec:     json.NewDecoder(bufio.NewReader(stdout)),
		pending: make(map[int64]chan *response),
	}
	go a.readLoop()
	return a, nil
}

func (a *Adapter) Call(method string, params any) (json.RawMessage, error) {
	id := a.nextID.Add(1)
	raw, err := json.Marshal(params)
	if err != nil {
		return nil, err
	}
	ch := make(chan *response, 1)

	a.mu.Lock()
	a.pending[id] = ch
	err = a.enc.Encode(request{JSONRPC: "2.0", ID: id, Method: method, Params: raw})
	a.mu.Unlock()

	if err != nil {
		return nil, err
	}

	resp, ok := <-ch
	if !ok {
		return nil, fmt.Errorf("plugin adapter closed while waiting for response to %q", method)
	}
	if resp.Error != nil {
		return nil, fmt.Errorf("plugin error %d: %s", resp.Error.Code, resp.Error.Message)
	}
	return resp.Result, nil
}

func (a *Adapter) readLoop() {
	defer func() {
		a.mu.Lock()
		for id, ch := range a.pending {
			close(ch)
			delete(a.pending, id)
		}
		a.mu.Unlock()
	}()
	for {
		var resp response
		if err := a.dec.Decode(&resp); err != nil {
			return
		}
		a.mu.Lock()
		if ch, ok := a.pending[resp.ID]; ok {
			delete(a.pending, resp.ID)
			ch <- &resp
		}
		a.mu.Unlock()
	}
}

func (a *Adapter) Close() error {
	return a.cmd.Process.Kill()
}
