"use client";

import {
  AudioTrack,
  ConnectionStateToast,
  ControlBar,
  ParticipantTile,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { useState } from "react";
import type { MediaAvailability } from "./media";

/** Обе громкости переживают перезаход в звонок. */
const VOICE_VOLUME_KEY = "peerVolume";
const SCREEN_VOLUME_KEY = "screenVolume";

function readSavedVolume(key: string): number {
  if (typeof window === "undefined") return 1;
  const raw = Number(localStorage.getItem(key));
  // Пустая строка/мусор → Number даёт NaN или 0 от null; берём только валидное.
  return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : 1;
}

/**
 * Одна независимая ручка громкости (0…1), запомненная в localStorage.
 *
 * Ноль не сохраняем: иначе кнопка «включить звук» не знала бы, на какой
 * уровень возвращаться, а после перезахода звонок был бы немым.
 */
function useVolume(key: string) {
  const [volume, setVolume] = useState(() => readSavedVolume(key));

  const change = (next: number) => {
    setVolume(next);
    if (next > 0) localStorage.setItem(key, String(next));
  };

  return {
    volume,
    change,
    toggleMute: () => change(volume === 0 ? readSavedVolume(key) : 0),
  };
}

/**
 * Громкость + кнопка mute одной строкой.
 * `caption` — короткая видимая подпись, `label` — полная для скринридера.
 */
function VolumeRow({
  label,
  caption,
  icon,
  volume,
  onChange,
  onToggleMute,
}: {
  label: string;
  caption: string;
  icon: string;
  volume: number;
  onChange: (next: number) => void;
  onToggleMute: () => void;
}) {
  const muted = volume === 0;
  return (
    <div className="family-volume">
      <button
        type="button"
        className="family-volume-icon"
        onClick={onToggleMute}
        aria-label={muted ? `Включить: ${label}` : `Выключить: ${label}`}
      >
        {muted ? "🔇" : icon}
      </button>
      <span className="family-volume-label" aria-hidden="true">
        {caption}
      </span>
      <input
        className="family-volume-slider"
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(volume * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        aria-label={label}
      />
      <span className="family-volume-value">{Math.round(volume * 100)}%</span>
    </div>
  );
}

type FamilyConferenceProps = {
  /** Какие устройства есть на этом компьютере — по ним собираем панель кнопок. */
  devices: MediaAvailability;
  /** Некритичное предупреждение поверх видео (нет камеры и т.п.). */
  notice?: string | null;
  onDismissNotice?: () => void;
};

/**
 * Своя раскладка вместо стандартного <VideoConference/>.
 *
 * Обычный режим — ширина колонки собеседника зависит от ориентации ЕГО видео
 * (как её определяет LiveKit: width > height ? landscape : portrait):
 *
 *   собеседник вертикальный (телефон)   собеседник горизонтальный
 *   ┌──────────────────┬────────┐       ┌─────────────┬─────────────┐
 *   │     ТЫ (16:9)    │ он 9:16│       │     ТЫ      │     он      │
 *   │   крупно слева   │ справа │       │  поровну    │  поровну    │
 *   └──────────────────┴────────┘       └─────────────┴─────────────┘
 *
 * Когда кто-то включает демонстрацию экрана — экран показывается крупно,
 * а камеры участников уезжают миниатюрами в боковую колонку.
 *
 * Object-fit LiveKit ставит сам: вертикальное видео — contain (видно
 * целиком, без обрезки), горизонтальное — cover, демонстрация экрана — contain.
 */
export function FamilyConference({
  devices,
  notice,
  onDismissNotice,
}: FamilyConferenceProps) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  // Весь входящий звук комнаты. Ровно тот же набор источников, что берёт
  // штатный RoomAudioRenderer, — но громкость каждому треку ставим свою,
  // поэтому рендерим <AudioTrack> сами (см. ниже).
  const audioTracks = useTracks(
    [Track.Source.Microphone, Track.Source.ScreenShareAudio, Track.Source.Unknown],
    { updateOnlyOn: [], onlySubscribed: true },
  ).filter((t) => !t.participant.isLocal && t.publication.kind === Track.Kind.Audio);

  const hasScreenAudio = audioTracks.some(
    (t) => t.source === Track.Source.ScreenShareAudio,
  );

  // Две независимые ручки (0…1): голос и звук демонстрации экрана.
  // Больше 1 браузер в <audio volume> не принимает.
  const voice = useVolume(VOICE_VOLUME_KEY);
  const screen = useVolume(SCREEN_VOLUME_KEY);

  const cameraTracks = tracks.filter((t) => t.source === Track.Source.Camera);
  // withPlaceholder: false → запись о демонстрации появляется только когда
  // экран реально шарят (кем угодно из участников).
  const screenTrack = tracks.find((t) => t.source === Track.Source.ScreenShare);

  const selfTrack = cameraTracks.find((t) => t.participant.isLocal);
  const peerTracks = cameraTracks.filter((t) => !t.participant.isLocal);

  // Узкую колонку 9:16 даём собеседнику ТОЛЬКО когда его кадр вертикальный.
  // Горизонтальный → делим экран поровну. Пока собеседника/размеров нет —
  // держим колонку узкой, чтобы твоё видео оставалось крупным.
  const peerDims = peerTracks[0]?.publication?.dimensions;
  const peerState =
    peerTracks.length === 0
      ? "empty"
      : peerDims && peerDims.width > peerDims.height
        ? "landscape"
        : "portrait";

  return (
    <div className="family-conference">
      {notice && (
        <div className="family-notice" role="status">
          <span>{notice}</span>
          {onDismissNotice && (
            <button
              type="button"
              className="family-notice-close"
              onClick={onDismissNotice}
              aria-label="Скрыть сообщение"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {screenTrack ? (
        // Демонстрация экрана — крупно, камеры миниатюрами сбоку.
        <div className="family-stage" data-mode="screen">
          <div className="family-screen">
            <ParticipantTile trackRef={screenTrack} className="family-tile" />
          </div>
          <div className="family-thumbs">
            {cameraTracks.map((t) => (
              <ParticipantTile
                key={t.participant.identity}
                trackRef={t}
                className="family-tile"
              />
            ))}
          </div>
        </div>
      ) : (
        // Обычный режим: ты слева, собеседник справа.
        <div className="family-stage" data-mode="cameras" data-peer={peerState}>
          <div className="family-self">
            {selfTrack && <ParticipantTile trackRef={selfTrack} className="family-tile" />}
          </div>

          <div className="family-peers">
            {peerTracks.length === 0 ? (
              <p className="family-waiting">Ждём собеседника…</p>
            ) : (
              peerTracks.map((t) => (
                <ParticipantTile
                  key={t.participant.identity}
                  trackRef={t}
                  className="family-tile"
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Громкость — строками над кнопками, чтобы было видно и можно было
          тянуть пальцем. Вторую строку показываем только когда со стороны
          собеседника реально идёт звук демонстрации: без неё панель проще. */}
      <VolumeRow
        label="Громкость голоса собеседника"
        caption="Голос"
        icon="🔊"
        volume={voice.volume}
        onChange={voice.change}
        onToggleMute={voice.toggleMute}
      />
      {hasScreenAudio && (
        <VolumeRow
          label="Громкость звука демонстрации экрана"
          caption="Экран"
          icon="🖥️"
          volume={screen.volume}
          onChange={screen.change}
          onToggleMute={screen.toggleMute}
        />
      )}

      {/* Кнопки камеры и микрофона показываем только если устройство есть:
          иначе нажатие всё равно закончится ошибкой доступа. */}
      <ControlBar
        controls={{
          camera: devices.camera,
          microphone: devices.microphone,
          chat: false,
          screenShare: true,
          settings: false,
          leave: true,
        }}
      />
      {/* Замена RoomAudioRenderer: он умеет только одну громкость на все треки.
          Скрытые <audio>, у каждого своя громкость по источнику. */}
      <div style={{ display: "none" }}>
        {audioTracks.map((t) => (
          <AudioTrack
            key={`${t.participant.identity}-${t.publication.trackSid}`}
            trackRef={t}
            volume={
              t.source === Track.Source.ScreenShareAudio
                ? screen.volume
                : voice.volume
            }
          />
        ))}
      </div>
      <ConnectionStateToast />
    </div>
  );
}
