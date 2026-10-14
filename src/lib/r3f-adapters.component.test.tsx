import {
  render,
  screen,
  fireEvent,
} from "@testing-library/react";
import {
  Component,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { describe, expect, it, vi } from "vitest";

import {
  R3FAdaptersProvider,
  useFrameAdapter,
  useThreeAdapter,
  type FrameStateLike,
  type R3FAdapters,
} from "@/lib/r3f-adapters";
import type { RootState } from "@react-three/fiber";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function makeAdapters(
  overrides: Partial<R3FAdapters> = {},
): R3FAdapters {
  return {
    useFrame: () => {},
    useThree: () =>
      ({
        camera: { name: "fake" },
        scene: { name: "fake" },
        clock: { elapsedTime: 0 },
      }) as unknown as RootState,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* Rendered output                                                            */
/* -------------------------------------------------------------------------- */

describe("R3FAdaptersProvider — rendered output", () => {
  it("renders its children into the DOM", () => {
    render(
      <R3FAdaptersProvider adapters={makeAdapters()}>
        <div data-testid="child">hello</div>
      </R3FAdaptersProvider>,
    );

    expect(screen.getByTestId("child")).toHaveTextContent("hello");
  });

  it("renders deeply nested children", () => {
    render(
      <R3FAdaptersProvider adapters={makeAdapters()}>
        <div>
          <span>a</span>
          <span data-testid="deep">b</span>
        </div>
      </R3FAdaptersProvider>,
    );

    expect(screen.getByTestId("deep")).toHaveTextContent("b");
  });

  it("renders siblings under a single provider", () => {
    render(
      <R3FAdaptersProvider adapters={makeAdapters()}>
        <div data-testid="first">first</div>
        <div data-testid="second">second</div>
      </R3FAdaptersProvider>,
    );

    expect(screen.getByTestId("first")).toBeInTheDocument();
    expect(screen.getByTestId("second")).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Consumer components                                                        */
/* -------------------------------------------------------------------------- */

describe("consumers inside a provider", () => {
  it("a component reading scene state via useThreeAdapter renders it", () => {
    const adapters = makeAdapters({
      useThree: () =>
        ({
          camera: { name: "cam-42" },
          scene: { name: "scene-x" },
          clock: { elapsedTime: 0 },
        }) as unknown as RootState,
    });

    function CameraName(): ReactElement {
      const state = useThreeAdapter();
      const cam = state.camera as { name?: string };
      return <span data-testid="cam">{cam.name}</span>;
    }

    render(
      <R3FAdaptersProvider adapters={adapters}>
        <CameraName />
      </R3FAdaptersProvider>,
    );

    expect(screen.getByTestId("cam")).toHaveTextContent("cam-42");
  });

  it("a component subscribing via useFrameAdapter renders initial state", () => {
    function FrameAware(): ReactElement {
      const [ticks, setTicks] = useState(0);

      useFrameAdapter(() => {
        setTicks((n) => n + 1);
      });

      return <span data-testid="ticks">{ticks}</span>;
    }

    let storedCallback: ((s: FrameStateLike) => void) | null = null;

    const adapters = makeAdapters({
      useFrame: (cb) => {
        storedCallback = cb;
      },
    });

    render(
      <R3FAdaptersProvider adapters={adapters}>
        <FrameAware />
      </R3FAdaptersProvider>,
    );

    expect(screen.getByTestId("ticks")).toHaveTextContent("0");
    expect(storedCallback).not.toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* User interaction                                                           */
/* -------------------------------------------------------------------------- */

describe("user interaction", () => {
  it("a click handler that reads scene state sees the injected values", () => {
    const adapters = makeAdapters({
      useThree: () =>
        ({
          camera: { name: "clicked-cam" },
          scene: {},
          clock: { elapsedTime: 0 },
        }) as unknown as RootState,
    });

    function CameraButton(): ReactElement {
      const state = useThreeAdapter();
      const [label, setLabel] = useState("idle");

      return (
        <button
          data-testid="btn"
          onClick={() => {
            const cam = state.camera as { name?: string };
            setLabel(cam.name ?? "unknown");
          }}
        >
          {label}
        </button>
      );
    }

    render(
      <R3FAdaptersProvider adapters={adapters}>
        <CameraButton />
      </R3FAdaptersProvider>,
    );

    const btn = screen.getByTestId("btn");
    expect(btn).toHaveTextContent("idle");

    fireEvent.click(btn);
    expect(btn).toHaveTextContent("clicked-cam");
  });
});

/* -------------------------------------------------------------------------- */
/* Error boundary                                                             */
/* -------------------------------------------------------------------------- */

interface BoundaryProps {
  readonly children: ReactNode;
}

interface BoundaryState {
  readonly message: string | null;
}

class Boundary extends Component<BoundaryProps, BoundaryState> {
  public state: BoundaryState = { message: null };

  public static getDerivedStateFromError(
    err: unknown,
  ): BoundaryState {
    return {
      message: err instanceof Error ? err.message : "unknown",
    };
  }

  public componentDidCatch(): void {
    // Silence the default React log; nothing else to do here.
  }

  public render(): ReactNode {
    if (this.state.message !== null) {
      return <div data-testid="error">{this.state.message}</div>;
    }
    return this.props.children;
  }
}

/* -------------------------------------------------------------------------- */
/* Error behavior                                                             */
/* -------------------------------------------------------------------------- */

describe("missing provider", () => {
  it("a consumer without a provider throws a helpful error", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    function Consumer(): null {
      useThreeAdapter();
      return null;
    }

    expect(() => render(<Consumer />)).toThrow(
      /R3F adapters are not available/,
    );

    consoleError.mockRestore();
  });

  it("an error boundary catches the missing-provider error", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    function Consumer(): null {
      useThreeAdapter();
      return null;
    }

    render(
      <Boundary>
        <Consumer />
      </Boundary>,
    );

    expect(screen.getByTestId("error")).toHaveTextContent(
      /R3FAdaptersProvider/,
    );

    consoleError.mockRestore();
  });
});

/* -------------------------------------------------------------------------- */
/* Default adapters                                                           */
/* -------------------------------------------------------------------------- */

describe("default adapters", () => {
  it("the provider mounts without an explicit adapters prop", () => {
    render(
      <R3FAdaptersProvider>
        <div data-testid="safe-child">ok</div>
      </R3FAdaptersProvider>,
    );

    expect(screen.getByTestId("safe-child")).toHaveTextContent("ok");
  });
});

/* -------------------------------------------------------------------------- */
/* Accessibility                                                              */
/* -------------------------------------------------------------------------- */

describe("accessibility", () => {
  it("renders a button as an actual button with an accessible name", () => {
    const adapters = makeAdapters();

    function Button(): ReactElement {
      useThreeAdapter();
      return <button>Activate</button>;
    }

    render(
      <R3FAdaptersProvider adapters={adapters}>
        <Button />
      </R3FAdaptersProvider>,
    );

    const btn = screen.getByRole("button", { name: "Activate" });
    expect(btn).toBeInTheDocument();
  });
});