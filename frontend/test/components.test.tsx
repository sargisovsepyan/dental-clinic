import axe from "axe-core";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalizedText } from "@/components/localized-text";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { EmptyState, ErrorState, PageIntro } from "@/components/page-shell";
import { PublicImage } from "@/components/public-media";
import Loading from "@/app/[locale]/loading";
import { BeforeAfterCard } from "@/components/before-after-card";
import { DentistCard } from "@/components/dentist-card";
import { ClinicDetails } from "@/components/clinic-details";
import { productMessages } from "@/i18n/product-messages";
import { StaffLanguageSwitcher } from "@/components/staff/staff-language-switcher";

let pathname = "/ru/services/test-cleaning";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams("page=2&patientName=must-not-survive"),
}));
vi.mock("next/link", () => ({
  default: ({ href, ...props }: ComponentProps<"a">) => <a href={href} {...props} />,
}));

const runAxe = (container: Element) => axe.run(container, {
  rules: { "color-contrast": { enabled: false } },
});
afterEach(() => { pathname = "/ru/services/test-cleaning"; });

describe("public UI safety and accessibility", () => {
  it("renders backend text literally instead of interpreting HTML", () => {
    render(<LocalizedText text={'<img src=x onerror="alert(1)">'} lang="hy" />);
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("preserves the logical route in an accessible locale switcher", async () => {
    const { container } = render(<LocaleSwitcher locale="ru" label="Язык" />);
    expect(screen.getByRole("link", { name: "EN" })).toHaveAttribute("href", "/en/services/test-cleaning?page=2");
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

  it("falls back when a validated remote image fails at runtime", () => {
    render(<PublicImage image={{ src: "https://res.cloudinary.com/clinic/image/upload/missing.webp", width: 100, height: 100 }} alt="Clinic reception" />);
    fireEvent.error(screen.getByRole("img", { name: "Clinic reception" }));
    expect(screen.getByRole("img", { name: "Clinic reception" })).toHaveAttribute("aria-label", "Clinic reception");
  });

  it("serves deterministic local preview images without the Next.js optimizer", () => {
    render(<PublicImage image={{ src: "/og.png", width: 640, height: 480 }} alt="Preview image" />);
    const image = screen.getByRole("img", { name: "Preview image" });
    const src = image.getAttribute("src");
    expect(src).toMatch(/\/og\.png$/);
    expect(src).not.toContain("/_next/image");
    expect(image).toHaveAttribute("loading", "eager");
  });

  it("switches staff language by pathname only and never forwards sensitive query state", () => {
    pathname = "/ru/staff/dentists";
    const { rerender } = render(<StaffLanguageSwitcher locale="ru" />);
    expect(screen.getByRole("link", { name: "EN" })).toHaveAttribute("href", "/en/staff/dentists");
    expect(screen.getByRole("link", { name: "RU" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "EN" }).getAttribute("href")).not.toContain("patientName");
    pathname = "/ru/staff/setup-password";
    rerender(<StaffLanguageSwitcher locale="ru" />);
    expect(screen.queryByRole("navigation", { name: "Язык интерфейса" })).not.toBeInTheDocument();
  });

  it("never renders a visible illustration disclaimer overlay", () => {
    const { container } = render(<PublicImage image={{ src: "/illustrations/waiting.svg", width: 1200, height: 800 }} alt="Waiting area" lang="ru" />);
    expect(screen.getByRole("img", { name: "Waiting area" })).toBeVisible();
    expect(container).not.toHaveTextContent(productMessages.ru.illustration);
  });

  it("deduplicates normalized dentist titles and specializations", () => {
    render(<DentistCard locale="en" dentist={{
      slug: "ani-petrosyan", fullName: "Ani Petrosyan", fullNameLang: "en",
      title: { text: "General Dentist", lang: "en" },
      specializations: { values: [" general  dentist ", "GENERAL DENTIST", "Restorative dentistry", "restorative dentistry"], lang: "en" },
      photo: null,
    }} />);
    expect(screen.getByText("General Dentist")).toBeVisible();
    expect(screen.getByText("Restorative dentistry")).toBeVisible();
    expect(screen.queryByText(/general dentist ·/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/General Dentist/i)).toHaveLength(1);
  });

  it("groups identical clinic hours and keeps the lunch break and closed day explicit", () => {
    const schedule = Array.from({ length: 7 }, (_, index) => ({
      dayOfWeek: index + 1,
      isOpen: index < 6,
      shifts: index < 6 ? [{ start: "09:00", end: "13:00" }, { start: "14:00", end: "18:00" }] : [],
    }));
    render(<ClinicDetails locale="en" clinic={{ address: { text: "Yerevan", lang: "en" }, phone: "+37410000000", secondaryPhone: "", email: "", mapUrl: "", socialLinks: {}, weeklySchedule: schedule }} />);
    expect(screen.getByText("Monday–Saturday")).toBeVisible();
    expect(screen.getByText("09:00–18:00")).toBeVisible();
    expect(screen.getByText("Break: 13:00–14:00")).toBeVisible();
    expect(screen.getByText("Sunday")).toBeVisible();
    expect(screen.getByText("Closed")).toBeVisible();
  });

  it("does not invent a break between adjacent shifts", () => {
    render(<ClinicDetails locale="en" clinic={{ address: { text: "Yerevan", lang: "en" }, phone: "+37410000000", secondaryPhone: "", email: "", mapUrl: "", socialLinks: {}, weeklySchedule: [{ dayOfWeek: 1, isOpen: true, shifts: [{ start: "09:00", end: "13:00" }, { start: "13:00", end: "18:00" }] }] }} />);
    expect(screen.getByText("09:00–18:00")).toBeVisible();
    expect(screen.queryByText(/Break:/)).not.toBeInTheDocument();
  });

  it("marks the leading before-and-after pair as high priority when requested", () => {
    render(<BeforeAfterCard
      item={{
        id: "64b000000000000000000051",
        title: { text: "Test case", lang: "en" },
        description: { text: "Published with consent", lang: "en" },
        beforeImage: { src: "https://res.cloudinary.com/clinic/image/upload/before.webp", width: 640, height: 480 },
        afterImage: { src: "https://res.cloudinary.com/clinic/image/upload/after.webp", width: 640, height: 480 },
      }}
      locale="en"
      priority
    />);

    expect(screen.getAllByRole("img")).toHaveLength(2);
    for (const image of screen.getAllByRole("img")) {
      expect(image).not.toHaveAttribute("loading", "lazy");
    }
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
