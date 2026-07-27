import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Gauge } from "lucide-react";

// Test pure-presentational components from app-shell.tsx
import {
  StatCard,
  PageHeader,
  StatsSkeleton,
  ListSkeleton,
  CardGridSkeleton,
  type StatCardProps,
} from "@/components/app-shell";

describe("StatCard", () => {
  const baseProps: StatCardProps = {
    label: "Properties",
    value: 42,
    icon: Gauge,
    hint: "3 new this week",
  };

  it("renders the label and value", () => {
    render(<StatCard {...baseProps} />);
    expect(screen.getByText("Properties")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders the hint when provided", () => {
    render(<StatCard {...baseProps} />);
    expect(screen.getByText("3 new this week")).toBeInTheDocument();
  });

  it("renders without hint", () => {
    const { label, value, icon } = baseProps;
    render(<StatCard label={label} value={value} icon={icon} />);
    expect(screen.getByText("Properties")).toBeInTheDocument();
    expect(screen.queryByText("3 new this week")).not.toBeInTheDocument();
  });

  it("applies animation delay from props", () => {
    const { container } = render(<StatCard {...baseProps} delay={160} />);
    const card = container.firstChild as HTMLElement;
    expect(card.style.animationDelay).toBe("160ms");
  });

  it("renders numeric value as formatted string", () => {
    render(<StatCard {...baseProps} value={0} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("renders a string value", () => {
    render(<StatCard {...baseProps} value="3h 12m" />);
    expect(screen.getByText("3h 12m")).toBeInTheDocument();
  });

  it("has animate-card-enter class for entrance animation", () => {
    const { container } = render(<StatCard {...baseProps} />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("animate-card-enter");
  });
});

describe("PageHeader", () => {
  it("renders title and description", () => {
    render(
      <PageHeader title="Dashboard" description="Overview of everything" />,
    );
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Overview of everything")).toBeInTheDocument();
  });

  it("renders without description", () => {
    render(<PageHeader title="Dashboard" />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("renders action slot when provided", () => {
    render(
      <PageHeader
        title="Settings"
        action={<button type="button">Edit</button>}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Edit" }),
    ).toBeInTheDocument();
  });

  it("truncates long titles", () => {
    const longTitle = "A very long title that should be truncated ".repeat(10);
    const { container } = render(<PageHeader title={longTitle} />);
    const h1 = container.querySelector("h1");
    expect(h1?.className).toContain("truncate");
  });
});

describe("StatsSkeleton", () => {
  it("renders with custom count of 3", () => {
    const { container } = render(<StatsSkeleton count={3} />);
    const pulseDivs = container.querySelectorAll(".animate-pulse");
    // 3 cards × 3 pulses each = 9+
    expect(pulseDivs.length).toBeGreaterThanOrEqual(9);
  });

  it("defaults to count of 4", () => {
    const { container } = render(<StatsSkeleton />);
    const cards = container.children[0].children;
    expect(cards.length).toBe(4);
  });
});

describe("ListSkeleton", () => {
  it("renders correct number of rows", () => {
    const { container } = render(<ListSkeleton rows={4} />);
    const rows = container.children[0].children;
    expect(rows.length).toBe(4);
  });

  it("defaults to 5 rows", () => {
    const { container } = render(<ListSkeleton />);
    const rows = container.children[0].children;
    expect(rows.length).toBe(5);
  });
});

describe("CardGridSkeleton", () => {
  it("renders correct number of cards", () => {
    const { container } = render(<CardGridSkeleton count={2} />);
    const cards = container.children[0].children;
    expect(cards.length).toBe(2);
  });

  it("defaults to count of 6", () => {
    const { container } = render(<CardGridSkeleton />);
    const cards = container.children[0].children;
    expect(cards.length).toBe(6);
  });
});
