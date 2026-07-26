"use client";

import { LiveKitRoom } from "@livekit/components-react";
import "@livekit/components-styles";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FamilyConference } from "./FamilyConference";
import {
  describeDeviceFailure,
  describeMissingDevices,
  isMediaDeviceError,
  useMediaAvailability,
} from "./media";

type Status =
  | { kind: "preparing" }
  | { kind: "needs-setup" }
  | { kind: "error"; message: string; detail?: string }
  | { kind: "ready"; token: string } // токен есть, ждём нажатия «Войти»
  | { kind: "in-call"; token: string };

export default function CallPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "preparing" });
  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  // Что есть на этом устройстве. Проверяем заранее и без запроса разрешения,
  // чтобы не просить камеру там, где её нет: такой отказ прилетает в onError
  // комнаты и раньше выбрасывал пользователя из звонка.
  const devices = useMediaAvailability();

  // Некритичное предупреждение поверх видео («камера не найдена» и т.п.).
  const [notice, setNotice] = useState<string | null>(null);

  // Диагностика связи: ?relay=1 в URL принудительно гонит медиа через TURN-relay
  // (iceTransportPolicy: 'relay'). Если в обычном режиме звонок падает, а с
  // ?relay=1 — поднимается, значит у собеседника режется прямой WebRTC/UDP.
  const [forceRelay, setForceRelay] = useState(false);
  useEffect(() => {
    setForceRelay(new URLSearchParams(window.location.search).get("relay") === "1");
  }, []);

  const connectOptions = useMemo(
    () =>
      forceRelay
        ? { rtcConfig: { iceTransportPolicy: "relay" as const } }
        : undefined,
    [forceRelay],
  );

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
        {status.detail && <p className="hint">Детали: {status.detail}</p>}
        <button className="secondary-button" onClick={() => router.push("/")}>
          На главную
        </button>
      </Centered>
    );
  }

  if (status.kind === "ready") {
    // Шаг 2: явное нажатие → запрос камеры происходит в контексте жеста.
    if (devices === null) {
      return <Centered>Готовлю звонок…</Centered>;
    }

    const missing = describeMissingDevices(devices);
    // Спрашиваем разрешение только на то, что есть: «камеру», «микрофон» или оба.
    const asked = [
      devices.camera ? "камеру" : null,
      devices.microphone ? "микрофон" : null,
    ]
      .filter(Boolean)
      .join(" и ");

    return (
      <Centered>
        <p className="greeting">Готово к звонку</p>
        {asked && (
          <p className="hint">
            Сейчас браузер спросит разрешение на {asked} — нажми «Разрешить».
          </p>
        )}
        {missing && <p className="warning-note">{missing}</p>}
        <button
          className="primary-button"
          onClick={() => {
            setNotice(missing);
            setStatus({ kind: "in-call", token: status.token });
          }}
        >
          🎥 Войти в звонок
        </button>
        <button className="secondary-button" onClick={() => router.push("/")}>
          Отмена
        </button>
      </Centered>
    );
  }

  // Шаг 3: в звонке. Публикуем только то, что реально есть на устройстве —
  // просить камеру там, где её нет, значит получить NotFoundError и вылететь.
  return (
    <div className="call-stage" data-lk-theme="default">
      <LiveKitRoom
        token={status.token}
        serverUrl={serverUrl}
        connectOptions={connectOptions}
        connect
        video={devices?.camera ?? false}
        audio={devices?.microphone ?? false}
        onDisconnected={() => router.push("/")}
        onMediaDeviceFailure={(failure, kind) => {
          // Камера/микрофон отвалились — связь при этом жива, звонок не рвём.
          console.warn("LiveKit media device failure:", failure, kind);
          setNotice(describeDeviceFailure(failure, kind));
        }}
        onError={(error) => {
          // Не смогли включить камеру/микрофон — связь при этом в порядке,
          // из звонка не выбрасываем. Текст предупреждения уже поставил
          // onMediaDeviceFailure: он знает, какое именно устройство подвело.
          if (isMediaDeviceError(error)) {
            console.warn("LiveKit device error (звонок продолжается):", error);
            return;
          }
          console.error("LiveKit connection error:", error);
          setStatus({
            kind: "error",
            message: "Связь прервалась. Попробуй позвонить снова.",
            detail: `${error.name}: ${error.message}`,
          });
        }}
      >
        <FamilyConference
          devices={devices ?? { camera: false, microphone: false, supported: false }}
          notice={notice}
          onDismissNotice={() => setNotice(null)}
        />
      </LiveKitRoom>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="centered">{children}</main>;
}
