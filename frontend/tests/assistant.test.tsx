import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvidenceList } from "@/components/assistant/EvidenceList";
import { CONTEXT_OPTIONS, MODE_NOTE, orderEvidence, splitCitations } from "@/lib/assistant";
import type { EvidenceItem } from "@/lib/types";

const item = (ref: string, cited: boolean, over: Partial<EvidenceItem> = {}): EvidenceItem => ({
  id: `id-${ref}`,
  ref,
  source_type: "lab_result",
  source_record_id: null,
  source_label: `label ${ref}`,
  recorded_at: "2026-04-12",
  verification_status: "patient_reported",
  cited,
  ...over,
});

describe("citation parsing", () => {
  it("splits text and markers in order", () => {
    expect(splitCitations("Went from 8.2 [E1] to 7.4 [E2].")).toEqual([
      { kind: "text", text: "Went from 8.2 " },
      { kind: "cite", ref: "E1" },
      { kind: "text", text: " to 7.4 " },
      { kind: "cite", ref: "E2" },
      { kind: "text", text: "." },
    ]);
  });
  it("leaves text without markers alone and ignores look-alikes", () => {
    expect(splitCitations("plain [x] [E] text")).toEqual([{ kind: "text", text: "plain [x] [E] text" }]);
    expect(splitCitations("")).toEqual([]);
  });
  it("never produces markup from model text", () => {
    const segs = splitCitations("<img src=x onerror=alert(1)> [E1]");
    expect(segs[0]).toEqual({ kind: "text", text: "<img src=x onerror=alert(1)> " });
  });
});

describe("evidence", () => {
  it("lists used evidence first, each group in numeric order", () => {
    const out = orderEvidence([item("E10", false), item("E2", true), item("E1", false), item("E3", true)]);
    expect(out.map((e) => e.ref)).toEqual(["E2", "E3", "E1", "E10"]);
  });
  it("shows source, date, verification and whether it was used", () => {
    render(<EvidenceList messageId="m1" items={[item("E1", true), item("E2", false, { recorded_at: null })]} />);
    expect(screen.getByText(/What this answer looked at \(2, 1 used\)/)).toBeInTheDocument();
    expect(screen.getByText("Used in the answer", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Looked at, not used", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/no date/)).toBeInTheDocument();
    expect(document.getElementById("ev-m1-E1")).not.toBeNull();
  });
  it("renders nothing when there is no evidence", () => {
    const { container } = render(<EvidenceList messageId="m1" items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("wording", () => {
  it("offers exactly the five context switches the server supports", () => {
    expect(CONTEXT_OPTIONS.map((o) => o.key)).toEqual(["medicines", "history", "labs", "doses", "allergies"]);
  });
  it("is honest about whether an AI model wrote the text", () => {
    expect(MODE_NOTE.evidence_only).toMatch(/No AI model wrote this/);
    expect(MODE_NOTE.fallback).toMatch(/did not pass our checks/);
  });
});
