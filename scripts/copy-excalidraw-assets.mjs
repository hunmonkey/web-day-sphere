// Excalidraw 폰트를 public/으로 복사해 오프라인(외부 CDN 미의존)에서도 동작하게 한다.
// 런타임에 window.EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/" 로 이 위치를 가리킨다.
// dev/build 직전(predev/prebuild)에 실행 — node_modules에서 복사하므로 git 추적은 불필요.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const src = path.join(
  root,
  "node_modules",
  "@excalidraw",
  "excalidraw",
  "dist",
  "prod",
  "fonts",
);
const dest = path.join(root, "public", "excalidraw-assets", "fonts");

if (!existsSync(src)) {
  console.warn("[excalidraw] 폰트 소스를 찾지 못해 건너뜁니다:", src);
  process.exit(0);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(path.dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("[excalidraw] 폰트 복사 완료 →", path.relative(root, dest));
