import axe from "axe-core";
import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { LocalizedText } from "@/components/localized-text";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { EmptyState, ErrorState, PageIntro } from "@/components/page-shell";
import { PublicImage } from "@/components/public-media";
import Loading from "@/app/[locale]/loading";

vi.mock("next/navigation", () => ({ usePathname: () => "/ru/services/test-cleaning" }));
vi.mock("next/link", () => ({
  default: ({ href, ...props }: ComponentProps<"a">) => <a href={href} {...props} />,
}));

const runAxe = (container: Element) => axe.run(container, {
  rules: { "color-contrast": { enabled: false } },
});

describe("public UI safety and accessibility", () => {
  it("renders backend text literally instead of interpreting HTML", () => {
    render(<LocalizedText text={'<img src=x onerror="alert(1)">'} lang="hy" />);
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("preserves the logical route in an accessible locale switcher", async () => {
    const { container } = render(<LocaleSwitcher locale="ru" label="Язык" />);
    expect(screen.getByRole("link", { name: "EN" })).toHaveAttribute("href", "/en/services/test-cleaning");
    expect(screen.getByRole("link", { name: "RU" })).toHaveAttribute("aria-current", "page");
    expect((await runAxe(container)).violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
  });

  it("uses a single semantic page heading", async () => {
    const { container } = render(<main><PageIntro eyebrow="Clinic" title="Services" description="Published services" /></main>);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect((await runAxe(container)).violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
  });

  it("keeps meaningful alternative text when a managed image is unavailable", () => {
    const { rerender } = render(<PublicImage image={null} alt="Clinic reception" lang="hy" />);
    expect(screen.getByRole("img", { name: "Clinic reception" })).toHaveAttribute("lang", "hy");

    rerender(<PublicImage image={null} alt="" />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("marks fallback page-introduction content with its authored language", () => {
    render(<PageIntro title="Clinic" titleLang="en" description="Հայերեն նկարագրություն" descriptionLang="hy" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveAttribute("lang", "en");
    expect(screen.getByText("Հայերեն նկարագրություն")).toHaveAttribute("lang", "hy");
  });

  it("renders localized empty and normalized error states without backend details", async () => {
    const { container } = render(
      <main>
        <EmptyState>No published content</EmptyState>
        <ErrorState locale="en" requestId="safe-request-123" />
      </main>,
    );
    expect(screen.getByText("No published content")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Content is temporarily unavailable");
    expect(screen.getByRole("alert")).toHaveTextContent("safe-request-123");
    expect((await runAxe(container)).violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
  });

  it("renders a deliberate non-blank loading state", () => {
    const { container } = render(<Loading />);
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(6);
  });
});
