import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ManagedMediaPreview, StaffFileField } from "@/components/staff/staff-media-shared";

const authState = { locale: "en" as const };

vi.mock("@/components/staff/staff-auth-provider", () => ({ useStaffAuth: () => authState }));

describe("staff media file preview", () => {
  const createObjectUrl = vi.fn();
  const revokeObjectUrl = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    createObjectUrl.mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("releases each ephemeral object URL when the file changes or the field unmounts", () => {
    const first = new File(["first"], "first.png", { type: "image/png" });
    const second = new File(["second"], "second.png", { type: "image/png" });
    const view = render(<StaffFileField label="Image" file={first} onFile={vi.fn()} />);

    expect(createObjectUrl).toHaveBeenCalledWith(first);
    view.rerender(<StaffFileField label="Image" file={second} onFile={vi.fn()} />);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:first");
    expect(createObjectUrl).toHaveBeenCalledWith(second);

    view.unmount();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:second");
  });

  it("forwards eager loading to the leading governed-media preview", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://127.0.0.1:5000/api/v1");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://127.0.0.1:3000");
    vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "clinic");

    render(<ManagedMediaPreview
      asset={{ publicId: "staff/gallery", secureUrl: "https://res.cloudinary.com/clinic/image/upload/staff/gallery.webp", width: 640, height: 480, format: "webp", bytes: 1024 }}
      alt="Clinic gallery"
      priority
    />);

    expect(screen.getByRole("img", { name: "Clinic gallery" })).not.toHaveAttribute("loading", "lazy");
  });
});
