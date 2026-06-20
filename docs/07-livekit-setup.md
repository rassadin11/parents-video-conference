# 07 — Настройка LiveKit

Пошаговая настройка видео-инфраструктуры и сервера токенов. Это Фаза 0 + часть
Фазы 1 из [04-roadmap.md](04-roadmap.md).

> ⚠️ Конкретные пункты меню и имена методов SDK со временем меняются. Перед
> работой свериться с актуальной документацией: **docs.livekit.io**. Ниже —
> проверенная общая схема.

## Шаг 1. Аккаунт и проект LiveKit Cloud

1. Зарегистрироваться на **livekit.io** → LiveKit Cloud.
2. Создать проект.
3. В настройках проекта найти и сохранить три значения:
   - **API Key**
   - **API Secret**
   - **WebSocket URL** вида `wss://<имя-проекта>.livekit.cloud`
4. Проверить лимиты бесплатного тарифа (livekit.io/pricing) — для семьи хватит
   с запасом.

## Шаг 2. Переменные окружения

В корне проекта — `.env.local` (добавить в `.gitignore`, **не коммитить**):

```env
LIVEKIT_API_KEY=APIxxxxxxxx
LIVEKIT_API_SECRET=secretxxxxxxxxxxxxxxxx
LIVEKIT_URL=wss://your-project.livekit.cloud
FAMILY_CODE=придумай-длинный-секрет-для-привязки-устройств
```

`FAMILY_CODE` — наш способ не пускать посторонних без логина (см. Шаг 5).

На Vercel эти же переменные задаются в настройках проекта (Settings →
Environment Variables) — см. [08-deployment.md](08-deployment.md).

## Шаг 3. Сервер токенов `/api/token`

Эндпоинт выдаёт короткоживущий JWT для входа в комнату. Ключ/секрет LiveKit
**остаются на сервере** и в браузер не попадают.

Принцип (Next.js App Router, `app/api/token/route.ts`):

```ts
import { AccessToken } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';

const ROOM = 'family';

export async function POST(req: Request) {
  const { identity, code } = await req.json();

  // 1. простая защита без логина: сверяем семейный код
  if (code !== process.env.FAMILY_CODE) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  // 2. имя участника обязательно (mama / papa / artem)
  if (!identity) {
    return NextResponse.json({ error: 'no identity' }, { status: 400 });
  }

  // 3. выпускаем токен на комнату family
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    { identity, ttl: '1h' }
  );
  at.addGrant({ roomJoin: true, room: ROOM, canPublish: true, canSubscribe: true });

  return NextResponse.json({ token: await at.toJwt() });
}
```

> Сверять имена методов (`AccessToken`, `addGrant`, `toJwt`) с актуальной версией
> `livekit-server-sdk` — они могут отличаться между мажорными версиями.

## Шаг 4. Подключение на фронтенде

С помощью готовых компонентов `@livekit/components-react` собственный UI почти не
нужен — комната с видео-сеткой и кнопками управления уже есть.

Принцип (`app/call/page.tsx`, упрощённо):

```tsx
'use client';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import '@livekit/components-styles';
import { useState } from 'react';

export default function CallPage() {
  const [token, setToken] = useState<string | null>(null);

  async function call() {
    const code = localStorage.getItem('familyCode');     // сохранён при setup
    const identity = localStorage.getItem('myName') ?? 'guest';
    const res = await fetch('/api/token', {
      method: 'POST',
      body: JSON.stringify({ identity, code }),
    });
    const { token } = await res.json();
    setToken(token);                                      // запрос камеры — после клика
  }

  if (!token) {
    return <button onClick={call} className="big-call-button">📞 Позвонить</button>;
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
      connect
      video
      audio
    >
      <VideoConference />
    </LiveKitRoom>
  );
}
```

Заметки:
- `serverUrl` (публичный `wss://`-URL) можно отдать в браузер — это не секрет.
  Удобно завести `NEXT_PUBLIC_LIVEKIT_URL` (префикс `NEXT_PUBLIC_` делает её
  доступной на клиенте).
- Доступ к камере запрашивается при подключении к комнате, т.е. **после клика** —
  это и UX-правильно, и требуется Safari.
- `<VideoConference>` даёт готовые кнопки микрофона/камеры/выхода. Для родителей
  позже можно заменить на свой более крупный и простой UI (Фаза 2).

## Шаг 5. Безопасность без логина

Поскольку входа нет, защита держится на двух вещах:

1. **`FAMILY_CODE`** — токен выдаётся, только если клиент прислал верный код.
   Код кладётся в `localStorage` один раз при настройке устройства
   (`/setup?code=...`) и дальше отправляется автоматически. Посторонний без кода
   токен не получит.
2. **Фиксированная комната** `family` — нет публичного списка/создания комнат.

Этого достаточно для семейного сервиса. Если захочется строже:

- выдавать токен только для разрешённого списка `identity` (mama/papa/artem);
- сделать `FAMILY_CODE` разным для каждого и при желании отзываемым;
- добавить срок жизни сессии и повторную привязку.

Главное правило, которое не нарушаем: **`LIVEKIT_API_SECRET` живёт только на
сервере** и никогда не уходит в браузер.

## Шаг 6. Локальная проверка

1. `npm run dev`, открыть `http://localhost:3000`.
2. На `localhost` камера доступна без HTTPS (исключение браузера) — удобно
   тестировать.
3. Открыть два «участника»: обычное окно + инкогнито (или телефон + компьютер
   после деплоя).
4. Оба нажимают «Позвонить» → должны увидеть друг друга.

Дальше — деплой и проверка по HTTPS: [08-deployment.md](08-deployment.md).
