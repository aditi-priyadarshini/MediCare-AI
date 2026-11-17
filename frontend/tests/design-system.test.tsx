import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import * as axeMatchers from "vitest-axe/matchers";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  AccessibleFormField,
  Button,
  ConfirmationDialog,
  EmptyState,
  ErrorState,
  Menu,
  PageHeader,
  SourceBadge,
  StatusBadge,
  StepProgress,
  Tabs,
  ToastProvider,
  useToast,
} from "@/components/ui";
import { ExperienceProvider, readExperience, useExperience } from "@/lib/experience";

expect.extend(axeMatchers);
const axe = configureAxe({ rules: { region: { enabled: false } } });
declare module "vitest" {
  interface Assertion {
    toHaveNoViolations(): void;
  }
}

describe("Button", () => {
  it("is busy and disabled while loading", () => {
    render(<Button loading>Save</Button>);
    const b = screen.getByRole("button", { name: "Save" });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute("aria-busy", "true");
  });
});

describe("badges", () => {
  it("StatusBadge always carries text, not just colour", async () => {
    const { container } = render(<StatusBadge tone="caution">Needs review</StatusBadge>);
    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(await axe(container)).toHaveNoViolations();
  });
  it("SourceBadge reuses verification labels", () => {
    render(<SourceBadge source="patient_reported" />);
    expect(screen.getByText("Patient reported")).toBeInTheDocument();
  });
});

describe("states", () => {
  it("ErrorState is an alert with a working retry", async () => {
    const retry = vi.fn();
    const { container } = render(<ErrorState onRetry={retry}>Check your connection.</ErrorState>);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
  it("EmptyState shows an explanation and one action", () => {
    render(<EmptyState title="No records yet" action={<Button>Add record</Button>}>Upload your first report.</EmptyState>);
    expect(screen.getByRole("button", { name: "Add record" })).toBeInTheDocument();
  });
});

describe("PageHeader and StepProgress", () => {
  it("renders one h1 with actions", async () => {
    const { container } = render(<PageHeader title="Medications" description="Your list" actions={<Button>Add</Button>} />);
    expect(screen.getByRole("heading", { level: 1, name: "Medications" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
  it("marks the current step", async () => {
    const { container } = render(<StepProgress steps={["Profile", "Consent", "Done"]} current={1} />);
    expect(screen.getByText("Consent").closest("li")).toHaveAttribute("aria-current", "step");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("form field", () => {
  it("links error and hint to the control", async () => {
    const { container } = render(
      <AccessibleFormField label="Dose" error="Enter a number">
        {({ id, describedBy, invalid }) => <input id={id} aria-describedby={describedBy} aria-invalid={invalid} />}
      </AccessibleFormField>,
    );
    const input = screen.getByLabelText("Dose");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toBeTruthy();
    expect(await axe(container)).toHaveNoViolations();
  });
});

function DialogHarness({ destructive }: { destructive?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <ConfirmationDialog open={open} title="Delete record?" destructive={destructive} confirmLabel="Delete" onConfirm={() => setOpen(false)} onCancel={() => setOpen(false)}>
        This cannot be undone.
      </ConfirmationDialog>
    </>
  );
}

describe("ConfirmationDialog", () => {
  it("moves focus in, traps Tab, closes on Escape and returns focus", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "Open" });
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Delete record?" })).toBeInTheDocument();
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Delete" })).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus(); // wrapped, not escaped
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });
  it("uses alertdialog for destructive actions and passes axe", async () => {
    const user = userEvent.setup();
    const { baseElement } = render(<DialogHarness destructive />);
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});

function Shout() {
  const { show } = useToast();
  return (
    <>
      <button onClick={() => show("Saved", "success")}>ok</button>
      <button onClick={() => show("Could not save", "danger")}>bad</button>
    </>
  );
}

describe("Toast", () => {
  it("announces as status, auto-dismisses, but keeps errors until dismissed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Shout />
      </ToastProvider>,
    );
    await user.click(screen.getByText("ok"));
    await user.click(screen.getByText("bad"));
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save");
    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss message" }));
    expect(screen.queryByRole("alert")).toBeNull();
    vi.useRealTimers();
  });
});

describe("Tabs", () => {
  it("switches with arrow keys and passes axe", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Tabs label="Sections" items={[{ id: "a", label: "One", content: <p>First</p> }, { id: "b", label: "Two", content: <p>Second</p> }]} />,
    );
    await user.click(screen.getByRole("tab", { name: "One" }));
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Two" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("Menu", () => {
  it("opens, navigates with arrows, selects, and returns focus on Escape", async () => {
    const user = userEvent.setup();
    const pick = vi.fn();
    render(<Menu label="Account" items={[{ label: "Settings", onSelect: pick }, { label: "Sign out", onSelect: () => {} }]} />);
    const button = screen.getByRole("button", { name: "Account" });
    await user.click(button);
    expect(screen.getByRole("menuitem", { name: "Settings" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(button).toHaveFocus();
    await user.click(button);
    await user.keyboard("{Enter}");
    expect(pick).toHaveBeenCalled();
  });
});

function ModeProbe() {
  const { experience, setExperience } = useExperience();
  return <button onClick={() => setExperience("easy")}>{experience}</button>;
}

describe("Experience mode", () => {
  it("defaults to standard, applies data-experience, and persists", async () => {
    window.localStorage.clear();
    render(
      <ExperienceProvider>
        <ModeProbe />
      </ExperienceProvider>,
    );
    expect(document.documentElement.dataset.experience).toBe("standard");
    await userEvent.click(screen.getByRole("button"));
    expect(document.documentElement.dataset.experience).toBe("easy");
    expect(readExperience()).toBe("easy");
  });
  it("falls back to standard when storage throws", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readExperience()).toBe("standard");
    spy.mockRestore();
  });
});
