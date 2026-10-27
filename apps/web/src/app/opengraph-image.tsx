import { ImageResponse } from "next/og";

export const alt = "Kadi — Good cards. Better company.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#242624",
        color: "#fff",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        overflow: "hidden",
        position: "relative",
        width: "100%",
      }}
    >
      <div
        style={{
          backgroundImage: "radial-gradient(#ffffff35 2px, transparent 2px)",
          backgroundSize: "18px 18px",
          height: "100%",
          opacity: 0.5,
          position: "absolute",
          width: "100%",
        }}
      />
      <div
        style={{
          alignItems: "center",
          background: "#bb0000",
          border: "12px solid #000",
          boxShadow: "18px 18px 0 #006600",
          display: "flex",
          flexDirection: "column",
          padding: "52px 100px",
          transform: "rotate(-2deg)",
        }}
      >
        <div style={{ color: "#fff", fontSize: 34, fontWeight: 900 }}>KADI</div>
        <div
          style={{
            color: "#fff",
            display: "flex",
            flexDirection: "column",
            fontSize: 86,
            fontWeight: 900,
            lineHeight: 1.05,
            marginTop: 16,
          }}
        >
          <div>Good cards.</div>
          <div>Better company.</div>
        </div>
        <div style={{ color: "#fff", fontSize: 27, marginTop: 26 }}>
          THE ONLINE TABLE FOR YOUR CREW
        </div>
      </div>
    </div>,
    size,
  );
}
