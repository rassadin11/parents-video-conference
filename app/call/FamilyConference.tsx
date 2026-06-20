"use client";

import {
  ConnectionStateToast,
  ControlBar,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";

/**
 * Своя раскладка вместо стандартного <VideoConference/>.
 *
 * Ширина колонки собеседника зависит от ориентации ЕГО видео
 * (как её определяет LiveKit: width > height ? landscape : portrait):
 *
 *   собеседник вертикальный (телефон)   собеседник горизонтальный
 *   ┌──────────────────┬────────┐       ┌─────────────┬─────────────┐
 *   │     ТЫ (16:9)    │ он 9:16│       │     ТЫ      │     он      │
 *   │   крупно слева   │ справа │       │  поровну    │  поровну    │
 *   └──────────────────┴────────┘       └─────────────┴─────────────┘
 *
 * Object-fit LiveKit ставит сам: вертикальное видео — contain (видно
 * целиком, без обрезки), горизонтальное — cover.
 */
export function FamilyConference() {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], {
    onlySubscribed: false,
  });

  const selfTrack = tracks.find((t) => t.participant.isLocal);
  const peerTracks = tracks.filter((t) => !t.participant.isLocal);

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
      <div className="family-stage" data-peer={peerState}>
        {/* Ты — большим планом слева */}
        <div className="family-self">
          {selfTrack && <ParticipantTile trackRef={selfTrack} className="family-tile" />}
        </div>

        {/* Собеседник(и) — вертикальной колонкой справа */}
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

      <ControlBar
        controls={{ chat: false, screenShare: false, settings: false }}
      />
      <RoomAudioRenderer />
      <ConnectionStateToast />
    </div>
  );
}
