import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#f7f2e8",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "center",
            border: "3px solid #246a69",
            borderRadius: "999px",
            display: "flex",
            height: 42,
            justifyContent: "center",
            width: 42,
          }}
        >
          <div
            style={{
              background: "#246a69",
              borderRadius: "999px",
              display: "flex",
              height: 16,
              width: 16,
            }}
          />
        </div>
      </div>
    ),
    size,
  );
}
