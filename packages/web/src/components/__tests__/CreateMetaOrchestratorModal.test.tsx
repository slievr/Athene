import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreateMetaOrchestratorModal } from "@/components/CreateMetaOrchestratorModal";

const projects = [
  { id: "proj-a", name: "Project Alpha" },
  { id: "proj-b", name: "Project Beta" },
];

describe("CreateMetaOrchestratorModal", () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
  });

  it("renders the form fields", () => {
    render(
      <CreateMetaOrchestratorModal
        projects={projects}
        existingNames={[]}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByText(/all projects/i)).toBeInTheDocument();
    expect(screen.getByText(/specific projects/i)).toBeInTheDocument();
  });

  it("shows project multi-select only when 'Specific projects' is selected", () => {
    render(
      <CreateMetaOrchestratorModal
        projects={projects}
        existingNames={[]}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    expect(screen.queryByText("Project Alpha")).toBeNull();

    fireEvent.click(screen.getByText(/specific projects/i));
    expect(screen.getByText("Project Alpha")).toBeInTheDocument();
    expect(screen.getByText("Project Beta")).toBeInTheDocument();
  });

  it("shows name validation error on blur for invalid characters", async () => {
    render(
      <CreateMetaOrchestratorModal
        projects={projects}
        existingNames={[]}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );
    const nameInput = screen.getByLabelText(/name/i);
    fireEvent.change(nameInput, { target: { value: "bad name!" } });
    fireEvent.blur(nameInput);
    await waitFor(() => {
      expect(screen.getByText(/\[a-zA-Z0-9_-\]/)).toBeInTheDocument();
    });
  });

  it("shows error when name already exists", async () => {
    render(
      <CreateMetaOrchestratorModal
        projects={projects}
        existingNames={["existing"]}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );
    const nameInput = screen.getByLabelText(/name/i);
    fireEvent.change(nameInput, { target: { value: "existing" } });
    fireEvent.blur(nameInput);
    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    });
  });

  it("disables submit and shows spinner while in-flight", async () => {
    vi.mocked(global.fetch).mockImplementation(
      () => new Promise(() => {}), // never resolves
    );
    render(
      <CreateMetaOrchestratorModal
        projects={projects}
        existingNames={[]}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "my-meta" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create/i })).toBeDisabled();
    });
  });

  it("calls onSuccess and onClose after successful submission", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ sessionId: "s1" }), { status: 201 }),
    );
    render(
      <CreateMetaOrchestratorModal
        projects={projects}
        existingNames={[]}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "my-meta" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("shows inline API error on failed submission", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Name already exists on server" }), { status: 409 }),
    );
    render(
      <CreateMetaOrchestratorModal
        projects={projects}
        existingNames={[]}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "my-meta" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => {
      expect(screen.getByText(/Name already exists on server/)).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when cancel/close is clicked", () => {
    render(
      <CreateMetaOrchestratorModal
        projects={projects}
        existingNames={[]}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
