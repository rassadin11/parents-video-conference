import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";

// Нужен Node.js-рантайм (livekit-server-sdk использует crypto).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Одна постоянная семейная комната. Звонки 1-на-1 — оба заходят сюда.
const ROOM = "family";

export async function POST(req: Request) {
  let body: { identity?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const { identity, code } = body;

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const familyCode = process.env.FAMILY_CODE;

  // Секреты должны быть на сервере. В браузер они не попадают.
  if (!apiKey || !apiSecret || !familyCode) {
    return NextResponse.json(
      { error: "server not configured" },
      { status: 500 }
    );
  }

  // Защита без логина: пускаем только устройства с верным семейным кодом.
  if (code !== familyCode) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!identity || typeof identity !== "string") {
    return NextResponse.json({ error: "identity required" }, { status: 400 });
  }

  const at = new AccessToken(apiKey, apiSecret, { identity, ttl: "1h" });
  at.addGrant({
    roomJoin: true,
    room: ROOM,
    canPublish: true,
    canSubscribe: true,
  });

  const token = await at.toJwt();
  return NextResponse.json({ token });
}
