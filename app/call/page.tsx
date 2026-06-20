"use client";

import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Status =
  | { kind: "preparing" }
  | { kind: "needs-setup" }
  | { kind: "error"; message: string }
  | { kind: "ready"; token: string } // токен есть, ждём нажатия «Войти»
  | { kind: "in-call"; token: string };

export default function CallPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "preparing" });
  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  // Шаг 1: получаем токен заранее (БЕЗ доступа к камере).
  // Доступ к камере запросим только после нажатия «Войти в звонок» —
  // так требует Safari и так понятнее пользователю.
  useEffect(() => {
    const code = localStorage.getItem("familyCode");
    const identity =
      localStorage.getItem("myName") ??
      "guest-" + Math.random().toString(36).slice(2, 8);

    if (!code) {
      setStatus({ kind: "needs-setup" });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ identity, code }),
        });
        if (cancelled) return;
        if (res.status === 403) {
          setStatus({
            kind: "error",
            message: "Это устройство не настроено для звонков. Обратись к Артёму.",
          });
          return;
        }
        if (!res.ok) {
          setStatus({
            kind: "error",
            message: "Не получилось подготовить звонок. Попробуй ещё раз.",
          });
          return;
        }
        const data = (await res.json()) as { token: string };
        setStatus({ kind: "ready", token: data.token });
      } catch {
        if (cancelled) return;
        setStatus({
          kind: "error",
          message: "Похоже, нет интернета. Проверь Wi-Fi и попробуй снова.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!serverUrl) {
    return (
      <Centered>
        <p>Видеосервер не настроен.</p>
        <p className="hint">Не задана переменная NEXT_PUBLIC_LIVEKIT_URL.</p>
        <button className="secondary-button" onClick={() => router.push("/")}>
          На главную
        </button>
      </Centered>
    );
  }

  if (status.kind === "preparing") {
    return <Centered>Готовлю звонок…</Centered>;
  }

  if (status.kind === "needs-setup") {
    return (
      <Centered>
        <p>Это устройство ещё не настроено для звонков.</p>
        <p className="hint">Открой ссылку настройки, которую дал Артём.</p>
        <button className="secondary-button" onClick={() => router.push("/")}>
          На главную
        </button>
      </Centered>
    );
  }

  if (status.kind === "error") {
    return (
      <Centered>
        <p className="danger-text">{status.message}</p>
        <button className="secondary-button" onClick={() => router.push("/")}>
          На главную
        </button>
      </Centered>
    );
  }

  if (status.kind === "ready") {
    // Шаг 2: явное нажатие → запрос камеры происходит в контексте жеста.
    return (
      <Centered>
        <p className="greeting">Готово к звонку</p>
        <p className="hint">
          Сейчас браузер спросит разрешение на камеру и микрофон — нажми
          «Разрешить».
        </p>
        <button
          className="primary-button"
          onClick={() =>
            setStatus({ kind: "in-call", token: status.token })
          }
        >
          🎥 Войти в звонок
        </button>
        <button className="secondary-button" onClick={() => router.push("/")}>
          Отмена
        </button>
      </Centered>
    );
  }

  // Шаг 3: в звонке.
  return (
    <div className="call-stage">
      <LiveKitRoom
        token={status.token}
        serverUrl={serverUrl}
        connect
        video
        audio
        onDisconnected={() => router.push("/")}
        onError={() =>
          setStatus({
            kind: "error",
            message: "Связь прервалась. Попробуй позвонить снова.",
          })
        }
      >
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="centered">{children}</main>;
}
