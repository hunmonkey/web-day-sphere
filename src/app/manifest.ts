import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Day Sphere",
    short_name: "Day Sphere",
    description: "개인 일정, 할 일, 메모, 알람을 한 곳에서 관리하는 대시보드.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#eef4ff",
    theme_color: "#248b86",
    shortcuts: [
      {
        name: "새 그림 메모",
        short_name: "새 메모",
        description: "빈 필기 캔버스를 바로 엽니다.",
        url: "/?compose=draw",
        icons: [
          {
            src: "/icons/day-sphere-icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
    ],
    icons: [
      {
        src: "/icons/day-sphere-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/day-sphere-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/day-sphere-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
