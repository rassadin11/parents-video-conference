"use client";

import { MediaDeviceFailure } from "livekit-client";
import { useEffect, useState } from "react";

/** Какие устройства захвата вообще есть на этом компьютере/телефоне. */
export type MediaAvailability = {
  camera: boolean;
  microphone: boolean;
  /** false — браузер вообще не даёт доступ к устройствам (например, сайт открыт не по HTTPS). */
  supported: boolean;
};

const NO_DEVICES: MediaAvailability = {
  camera: false,
  microphone: false,
  supported: false,
};

/**
 * Определяет наличие камеры и микрофона БЕЗ запроса разрешения: до разрешения
 * браузер скрывает названия устройств (label пустой), но сами записи отдаёт —
 * этого достаточно, чтобы понять, есть ли железо.
 *
 * Зачем: если попросить LiveKit опубликовать камеру там, где её нет,
 * getUserMedia падает с NotFoundError, ошибка прилетает в onError комнаты
 * и пользователь вылетает из звонка (см. app/call/page.tsx).
 */
async function detectMediaDevices(): Promise<MediaAvailability> {
  const media = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  if (!media?.enumerateDevices) return NO_DEVICES;

  try {
    const devices = await media.enumerateDevices();
    return {
      camera: devices.some((d) => d.kind === "videoinput"),
      microphone: devices.some((d) => d.kind === "audioinput"),
      supported: true,
    };
  } catch {
    return NO_DEVICES;
  }
}

/**
 * Список устройств + подписка на `devicechange`: если веб-камеру воткнут
 * (или выдернут) прямо во время разговора, кнопки в панели обновятся.
 * `null` — ещё проверяем.
 */
export function useMediaAvailability(): MediaAvailability | null {
  const [availability, setAvailability] = useState<MediaAvailability | null>(null);

  useEffect(() => {
    let cancelled = false;

    const refresh = () => {
      void detectMediaDevices().then((next) => {
        if (!cancelled) setAvailability(next);
      });
    };
    refresh();

    const media = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
    media?.addEventListener?.("devicechange", refresh);
    return () => {
      cancelled = true;
      media?.removeEventListener?.("devicechange", refresh);
    };
  }, []);

  return availability;
}

/**
 * Имена, которыми getUserMedia отклоняет запрос доступа к устройствам
 * (плюс собственный DeviceUnsupportedError у LiveKit).
 *
 * Нужны, чтобы отличить «не получилось включить камеру» (звонок при этом жив)
 * от настоящего обрыва связи. MediaDeviceFailure.getFailure для этого не
 * годится: он возвращает `Other` для любой ошибки с полем name, включая
 * ConnectionError.
 */
const DEVICE_ERROR_NAMES = new Set([
  "NotAllowedError",
  "PermissionDeniedError",
  "NotFoundError",
  "DevicesNotFoundError",
  "NotReadableError",
  "TrackStartError",
  "OverconstrainedError",
  "ConstraintNotSatisfiedError",
  "SecurityError",
  "AbortError",
  "DeviceUnsupportedError",
]);

/** Ошибка про камеру/микрофон, а не про связь? Такую нельзя считать фатальной. */
export function isMediaDeviceError(error: unknown): boolean {
  const name = (error as { name?: string } | null | undefined)?.name;
  return typeof name === "string" && DEVICE_ERROR_NAMES.has(name);
}

/** Подпись о том, чего не хватает перед входом в звонок (null — всё на месте). */
export function describeMissingDevices(a: MediaAvailability): string | null {
  if (!a.supported) {
    return "Браузер не даёт доступ к камере и микрофону. Собеседника будет видно и слышно, а тебя — нет.";
  }
  if (!a.camera && !a.microphone) {
    return "Камера и микрофон не найдены. Собеседника будет видно и слышно, а тебя — нет.";
  }
  if (!a.camera) return "Камера не найдена — тебя будет слышно, но не видно.";
  if (!a.microphone) return "Микрофон не найден — тебя будет видно, но не слышно.";
  return null;
}

function deviceLabels(kind?: MediaDeviceKind) {
  if (kind === "videoinput") return { dative: "к камере", accusative: "камеру" };
  if (kind === "audioinput") return { dative: "к микрофону", accusative: "микрофон" };
  return { dative: "к камере и микрофону", accusative: "камеру и микрофон" };
}

/** Подпись о поломке устройства уже во время звонка. Звонок при этом не рвём. */
export function describeDeviceFailure(
  failure?: MediaDeviceFailure,
  kind?: MediaDeviceKind,
): string {
  const { dative, accusative } = deviceLabels(kind);

  switch (failure) {
    case MediaDeviceFailure.PermissionDenied:
      return `Браузер не дал доступ ${dative}. Разреши доступ и позвони заново — пока продолжаем без этого.`;
    case MediaDeviceFailure.NotFound:
      return `Не нашёл ${accusative}. Продолжаем: собеседника видно и слышно.`;
    case MediaDeviceFailure.DeviceInUse:
      return `Другая программа занимает ${accusative}. Закрой её и включи кнопкой внизу.`;
    default:
      return `Не получилось включить ${accusative}. Продолжаем без этого.`;
  }
}
