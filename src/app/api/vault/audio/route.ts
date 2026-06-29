import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server/auth-session";
import { deleteAudio, readAudio, saveAudio } from "@/lib/server/vault-store";

export const runtime = "nodejs";

const AUDIO_TYPE = "audio/webm";
// 메모리에 통째로 올려 처리하므로 과한 업로드를 막는다. 최대 50MB.
const MAX_BYTES = 50 * 1024 * 1024;

function ids(request: Request) {
  const url = new URL(request.url);
  return {
    memo: url.searchParams.get("memo") ?? "",
    clip: url.searchParams.get("clip") ?? "",
  };
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { memo, clip } = ids(request);
  if (!memo || !clip) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length === 0) {
    return NextResponse.json({ error: "빈 녹음입니다." }, { status: 400 });
  }
  if (buf.length > MAX_BYTES) {
    return NextResponse.json({ error: "녹음이 너무 큽니다." }, { status: 413 });
  }
  await saveAudio(memo, clip, buf);
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { memo, clip } = ids(request);
  const buf = await readAudio(memo, clip);
  if (!buf) {
    return NextResponse.json({ error: "녹음을 찾을 수 없습니다." }, { status: 404 });
  }

  // Range 지원: 브라우저 <audio> 컨트롤의 탐색을 매끄럽게 한다.
  const range = request.headers.get("range");
  const match = range ? /bytes=(\d+)-(\d*)/.exec(range) : null;
  if (match) {
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : buf.length - 1;
    const chunk = buf.subarray(start, end + 1);
    return new NextResponse(new Uint8Array(chunk), {
      status: 206,
      headers: {
        "Content-Type": AUDIO_TYPE,
        "Content-Range": `bytes ${start}-${end}/${buf.length}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunk.length),
      },
    });
  }

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": AUDIO_TYPE,
      "Accept-Ranges": "bytes",
      "Content-Length": String(buf.length),
    },
  });
}

export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { memo, clip } = ids(request);
  if (!memo || !clip) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  await deleteAudio(memo, clip);
  return NextResponse.json({ ok: true });
}
