import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentMessageInput } from "../AgentMessageInput";

describe("AgentMessageInput", () => {
  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
      } as Response),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the textarea and send button", () => {
    render(<AgentMessageInput sessionId="test-session" />);
    expect(screen.getByRole("textbox", { name: "Send message to agent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
  });

  it("send button is disabled when textarea is empty", () => {
    render(<AgentMessageInput sessionId="test-session" />);
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  it("send button is enabled when textarea has content", () => {
    render(<AgentMessageInput sessionId="test-session" />);
    const textarea = screen.getByRole("textbox", { name: "Send message to agent" });
    fireEvent.change(textarea, { target: { value: "hello" } });
    expect(screen.getByRole("button", { name: "Send message" })).not.toBeDisabled();
  });

  it("pressing Enter submits the message", async () => {
    render(<AgentMessageInput sessionId="sess-1" />);
    const textarea = screen.getByRole("textbox", { name: "Send message to agent" });

    fireEvent.change(textarea, { target: { value: "fix the bug" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/sessions/sess-1/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "fix the bug" }),
      });
    });
  });

  it("pressing Shift+Enter does NOT submit the message", () => {
    render(<AgentMessageInput sessionId="sess-1" />);
    const textarea = screen.getByRole("textbox", { name: "Send message to agent" });

    fireEvent.change(textarea, { target: { value: "line one" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("clears the textarea after successful send", async () => {
    render(<AgentMessageInput sessionId="sess-1" />);
    const textarea = screen.getByRole("textbox", { name: "Send message to agent" });

    fireEvent.change(textarea, { target: { value: "hello world" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect((textarea as HTMLTextAreaElement).value).toBe("");
    });
  });

  it("shows an error message when the API call fails", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
      } as Response),
    );

    render(<AgentMessageInput sessionId="sess-1" />);
    const textarea = screen.getByRole("textbox", { name: "Send message to agent" });

    fireEvent.change(textarea, { target: { value: "hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Failed to send message.");
    });
  });

  it("sends via click on Send button", async () => {
    render(<AgentMessageInput sessionId="sess-2" />);
    const textarea = screen.getByRole("textbox", { name: "Send message to agent" });

    fireEvent.change(textarea, { target: { value: "click send" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/sessions/sess-2/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "click send" }),
      });
    });
  });
});
