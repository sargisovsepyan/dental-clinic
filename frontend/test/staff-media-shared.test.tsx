import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffFileField } from "@/components/staff/staff-media-shared";

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
});
