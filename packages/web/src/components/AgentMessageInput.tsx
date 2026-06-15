"use client";

import { useRef, useState } from "react";

interface AgentMessageInputProps {
  sessionId: string;
}

export function AgentMessageInput({ sessionId }: AgentMessageInputProps) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleSend() {
    const text = message.trim();
    if (!text || sending) return;
    setError(null);
    setSending(true);
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMessage("");
    } catch {
      setError("Failed to send message.");
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
    // Shift+Enter: browser inserts a newline naturally — no intervention needed
  }

  return (
    <div className="agent-message-input">
      <textarea
        ref={textareaRef}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Message agent… (Enter to send, Shift+Enter for new line)"
        rows={2}
        disabled={sending}
        aria-label="Send message to agent"
        className="agent-message-input__textarea"
      />
      <div className="agent-message-input__footer">
        {error ? (
          <span className="agent-message-input__error" role="alert">
            {error}
          </span>
        ) : (
          <span className="agent-message-input__hint">
            Enter to send · Shift+Enter for new line
          </span>
        )}
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!message.trim() || sending}
          aria-label="Send message"
          className="agent-message-input__send-btn"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
