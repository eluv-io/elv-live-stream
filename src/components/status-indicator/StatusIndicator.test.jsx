import {describe, it, expect, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MantineProvider} from "@mantine/core";
import StatusIndicator from "@/components/status-indicator/StatusIndicator.jsx";

const renderIndicator = (props) => render(
  <MantineProvider><StatusIndicator status="running" {...props} /></MantineProvider>
);

describe("StatusIndicator", () => {
  it("renders the status label without an alert icon when there are no errors and quality is good", () => {
    renderIndicator({quality: "good"});

    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.queryByLabelText("Errors")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Warning")).not.toBeInTheDocument();
  });

  it("renders the unreachable label", () => {
    renderIndicator({status: "unreachable"});

    expect(screen.getByText("Unreachable")).toBeInTheDocument();
  });

  it("shows a quality warning with a tooltip when quality is not good", async () => {
    renderIndicator({quality: "severe"});

    await userEvent.hover(screen.getByLabelText("Warning"));

    expect(await screen.findByText("Quality: Severe")).toBeInTheDocument();
  });

  it("prefers errors over a quality warning and summarizes the newest error", async () => {
    renderIndicator({quality: "severe", errors: ["t1 old error", "t2 new error"]});

    expect(screen.queryByLabelText("Warning")).not.toBeInTheDocument();
    await userEvent.hover(screen.getByLabelText("Errors"));

    expect(await screen.findByText("t2 new error (+1 more)")).toBeInTheDocument();
  });

  it("calls onErrorClick when the error indicator is clicked", async () => {
    const onErrorClick = vi.fn();
    renderIndicator({errors: ["t1 bad"], onErrorClick});

    await userEvent.click(screen.getByRole("button", {name: "View error log"}));

    expect(onErrorClick).toHaveBeenCalledTimes(1);
  });

  it("is not clickable for a quality warning only", () => {
    renderIndicator({quality: "degraded", onErrorClick: vi.fn()});

    expect(screen.queryByRole("button", {name: "View error log"})).not.toBeInTheDocument();
  });
});
