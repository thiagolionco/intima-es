import { ImageResponse } from "next/og";

export const alt = "Clepsa: monitoramento de intimações e prazos para escritórios de advocacia";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Imagem de compartilhamento (og:image), gerada no build com as cores da marca. */
export default function ImagemDeCompartilhamento() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 96, background: "#050a18", color: "#f8fafc" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <svg width="120" height="120" viewBox="0 0 32 32">
            <path d="M16 3.5c1.6 3.4 5 5.6 5 9.1a5 5 0 0 1-10 0c0-3.5 3.4-5.7 5-9.1Z" fill="#5c8dfd" />
            <ellipse cx="16" cy="25" rx="6.5" ry="2" fill="none" stroke="#5c8dfd" strokeWidth="1.8" />
            <ellipse cx="16" cy="25" rx="13" ry="4.2" fill="none" stroke="#5c8dfd" strokeOpacity=".55" strokeWidth="1.8" />
          </svg>
          <span style={{ fontSize: 96, fontWeight: 700, letterSpacing: -2 }}>Clepsa</span>
        </div>
        <div style={{ marginTop: 48, fontSize: 52, lineHeight: 1.15, color: "#ffffff" }}>Nenhuma intimação passa despercebida.</div>
        <div style={{ marginTop: 24, fontSize: 32, color: "#94a3b8" }}>Monitoramento de intimações e prazos do Comunica PJe</div>
      </div>
    ),
    size,
  );
}
