"use client";

import {
  ConnectionStateToast,
  ControlBar,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import type { MediaAvailability } from "./media";

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
      <RoomAudioRenderer />
      <ConnectionStateToast />
    </div>
  );
}
