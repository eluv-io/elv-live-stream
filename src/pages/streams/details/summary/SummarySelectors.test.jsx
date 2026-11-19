import {describe, it, expect, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MantineProvider} from "@mantine/core";
import {BuildStateData} from "@/pages/streams/details/summary/SummarySelectors.tsx";

describe("BuildStateData", () => {
  it("returns only the Quality row when there are no errors", () => {
    expect(BuildStateData({status: {quality: "good"}, errors: {Errors: null}}).map(row => row.label)).toEqual(["Quality"]);
  });

  it("adds an Errors row with the count and a View log link", async () => {
    const onViewErrors = vi.fn();
    const rows = BuildStateData({status: {quality: "severe"}, errors: ["t1 a", "t2 b"], onViewErrors});
    const errorsRow = rows.find(row => row.label === "Errors");

    render(<MantineProvider>{errorsRow.value}</MantineProvider>);
    await userEvent.click(screen.getByRole("button", {name: "View log"}));

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(onViewErrors).toHaveBeenCalledTimes(1);
  });
});
