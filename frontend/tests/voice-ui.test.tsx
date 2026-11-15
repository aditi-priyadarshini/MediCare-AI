import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceCommandBar } from "@/components/voice/VoiceCommandBar";
import { ReadAloudButton } from "@/components/voice/ReadAloudButton";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import { I18nProvider } from "@/lib/i18n";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/profile-context", () => ({
  useOptionalProfile: () => ({ profile: { accessibility_preferences: { voice_enabled: true } } }),
}));

/* ---- fake browser speech recognition ---- */
class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start() {
    FakeRecognition.last = this;
  }
  stop() {
    this.onend?.();
  }
  abort() {}
  say(text: string, isFinal = true) {
    const res = Object.assign([{ transcript: text }], { isFinal });
    act(() => this.onresult?.({ resultIndex: 0, results: [res] }));
    if (isFinal) act(() => this.onend?.());
  }
  fail(error: string) {
    act(() => this.onerror?.({ error }));
    act(() => this.onend?.());
  }
}

const win = window as unknown as Record<string, unknown>;
const installRecognition = () => (win.SpeechRecognition = FakeRecognition);

beforeEach(() => {
  push.mockClear();
  FakeRecognition.last = null;
});
afterEach(() => {
  delete win.SpeechRecognition;
  delete win.speechSynthesis;
  delete win.SpeechSynthesisUtterance;
});

describe("VoiceInputButton", () => {
  it("puts the transcript in the box and never submits anything itself", async () => {
    installRecognition();
    const onText = vi.fn();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <VoiceInputButton language="en" onText={onText} />
      </form>,
    );
    await userEvent.click(await screen.findByRole("button", { name: /speak/i }));
    expect(FakeRecognition.last?.lang).toBe("en-IN");
    FakeRecognition.last!.say("how has my HbA1c changed");
    expect(onText).toHaveBeenCalledWith("how has my HbA1c changed");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(/review and edit the text, then press send/i);
  });

  it("asks the browser for the patient's language", async () => {
    installRecognition();
    render(
      <I18nProvider language="hi">
        <VoiceInputButton language="hi" onText={() => {}} />
      </I18nProvider>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "बोलें" }));
    expect(FakeRecognition.last?.lang).toBe("hi-IN");
  });

  it("says plainly when the browser has no speech recognition", async () => {
    render(<VoiceInputButton language="en" onText={() => {}} />);
    expect(await screen.findByText(/not available in this browser/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("explains an unsupported language instead of failing silently", async () => {
    installRecognition();
    render(
      <I18nProvider language="en">
        <VoiceInputButton language="or" onText={() => {}} />
      </I18nProvider>,
    );
    await userEvent.click(await screen.findByRole("button", { name: /speak/i }));
    FakeRecognition.last!.fail("language-not-supported");
    expect(screen.getByRole("status")).toHaveTextContent(/Odia is not available in this browser/i);
  });

  it("explains a blocked microphone", async () => {
    installRecognition();
    render(<VoiceInputButton language="en" onText={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: /speak/i }));
    FakeRecognition.last!.fail("not-allowed");
    expect(screen.getByRole("status")).toHaveTextContent(/microphone access is blocked/i);
  });
});

/* ---- fake speech synthesis ---- */
function installSynthesis(voiceLangs: string[]) {
  const spoken: Array<{ text: string; lang: string }> = [];
  class Utterance {
    lang = "";
    voice: unknown = null;
    rate = 1;
    onend: (() => void) | null = null;
    onerror: ((e: { error: string }) => void) | null = null;
    constructor(public text: string) {}
  }
  win.SpeechSynthesisUtterance = Utterance;
  win.speechSynthesis = {
    getVoices: () => voiceLangs.map((lang) => ({ lang, name: lang })),
    addEventListener: () => {},
    removeEventListener: () => {},
    cancel: vi.fn(),
    speak: (u: Utterance) => spoken.push({ text: u.text, lang: u.lang }),
  };
  return spoken;
}

describe("ReadAloudButton", () => {
  it("reads the text in the matching voice", async () => {
    const spoken = installSynthesis(["en-IN"]);
    render(<ReadAloudButton text="Metformin 500 mg at 8:00 am." language="en" />);
    await userEvent.click(screen.getByRole("button", { name: /read aloud/i }));
    await waitFor(() => expect(spoken).toEqual([{ text: "Metformin 500 mg at 8:00 am.", lang: "en-IN" }]));
    expect(screen.getByRole("button", { name: /stop reading/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("refuses to read Hindi with a non-Hindi voice and says why", async () => {
    const spoken = installSynthesis(["en-IN"]);
    render(
      <I18nProvider language="en">
        <ReadAloudButton text="आपकी खुराकें।" language="hi" />
      </I18nProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /read aloud/i }));
    expect(await screen.findByText(/No Hindi voice is installed/i)).toBeInTheDocument();
    expect(spoken).toEqual([]);
  });

  it("says plainly when the browser cannot speak", async () => {
    render(<ReadAloudButton text="Hello." language="en" />);
    await userEvent.click(screen.getByRole("button", { name: /read aloud/i }));
    expect(await screen.findByText(/not available in this browser/i)).toBeInTheDocument();
  });

  it("is disabled when there is nothing to read", () => {
    installSynthesis(["en-IN"]);
    render(<ReadAloudButton text="   " language="en" />);
    expect(screen.getByRole("button", { name: /read aloud/i })).toBeDisabled();
  });
});

describe("VoiceCommandBar", () => {
  async function hear(phrase: string) {
    installRecognition();
    render(<VoiceCommandBar />);
    await userEvent.click(await screen.findByRole("button", { name: /voice command/i }));
    FakeRecognition.last!.say(phrase);
  }

  it("opens a page only after the patient taps Open", async () => {
    await hear("open medicines");
    expect(screen.getByText("Open Medicines?")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(push).toHaveBeenCalledWith("/medications");
  });

  it("cancel and Escape do nothing", async () => {
    await hear("open records");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByText(/Open Records\?/)).toBeNull();

    FakeRecognition.last = null;
    await userEvent.click(screen.getByRole("button", { name: /voice command/i }));
    FakeRecognition.last!.say("open labs");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText(/Open Lab results\?/)).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("refuses to log a dose by voice and offers no way to do it", async () => {
    await hear("I took my medicine");
    expect(screen.getByText(/cannot log doses or change medicines/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows 112 for an emergency and leaves the call to the patient", async () => {
    await hear("I have chest pain");
    expect(screen.getByText(/call 112 now/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /call 112/i })).toHaveAttribute("href", "tel:112");
    expect(push).not.toHaveBeenCalled();
  });

  it("says when it did not understand", async () => {
    await hear("blah blah");
    expect(screen.getByText(/not understood/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("renders nothing when the browser has no speech recognition", async () => {
    const { container } = render(<VoiceCommandBar />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
