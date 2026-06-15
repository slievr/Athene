import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

let mockResolvedTheme = "dark";
const mockSetTheme = vi.fn();

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: mockResolvedTheme, setTheme: mockSetTheme }),
}));

import { ThemeToggle } from "../ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    mockResolvedTheme = "dark";
    mockSetTheme.mockClear();
  });

  it("cycles dark → ocean when clicked in dark mode", () => {
    mockResolvedTheme = "dark";
    render(<ThemeToggle />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-label", "Switch to ocean mode");
    fireEvent.click(btn);
    expect(mockSetTheme).toHaveBeenCalledWith("ocean");
  });

  it("cycles ocean → light when clicked in ocean mode", () => {
    mockResolvedTheme = "ocean";
    render(<ThemeToggle />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-label", "Switch to light mode");
    fireEvent.click(btn);
    expect(mockSetTheme).toHaveBeenCalledWith("light");
  });

  it("cycles light → dark when clicked in light mode", () => {
    mockResolvedTheme = "light";
    render(<ThemeToggle />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-label", "Switch to dark mode");
    fireEvent.click(btn);
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  it("renders label when provided", () => {
    mockResolvedTheme = "dark";
    render(<ThemeToggle label="Theme" />);
    expect(screen.getByText("Theme")).toBeInTheDocument();
  });
});
