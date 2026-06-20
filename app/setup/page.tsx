"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

/**
 * Одноразовая настройка устройства (делает владелец, не родитель).
 *
 * Удобнее всего открыть готовую ссылку, например:
 *   /setup?code=СЕМЕЙНЫЙ_КОД&name=Мама&peer=Артёму
 * Тогда значения сохранятся автоматически. Можно и заполнить руками ниже.
 */
function SetupInner() {
  const params = useSearchParams();

  const [code, setCode] = useState("");
  const [myName, setMyName] = useState("");
  const [peerName, setPeerName] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const qCode = params.get("code");
    const qName = params.get("name");
    const qPeer = params.get("peer");

    setCode(qCode ?? localStorage.getItem("familyCode") ?? "");
    setMyName(qName ?? localStorage.getItem("myName") ?? "");
    setPeerName(qPeer ?? localStorage.getItem("peerName") ?? "");

    // Если код пришёл в ссылке — сохраняем сразу.
    if (qCode) {
      localStorage.setItem("familyCode", qCode);
      if (qName) localStorage.setItem("myName", qName);
      if (qPeer) localStorage.setItem("peerName", qPeer);
      setSaved(true);
    }
  }, [params]);

  function save() {
    if (code) localStorage.setItem("familyCode", code);
    if (myName) localStorage.setItem("myName", myName);
    if (peerName) localStorage.setItem("peerName", peerName);
    setSaved(true);
  }

  return (
    <main className="centered">
      <div className="setup-card">
        <h1>Настройка устройства</h1>
        <p className="hint" style={{ maxWidth: "none" }}>
          Заполняется один раз. После этого пользователь видит только кнопку
          «Позвонить».
        </p>

        <div className="field">
          <label htmlFor="code">Семейный код</label>
          <input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="тот же FAMILY_CODE, что на сервере"
          />
        </div>

        <div className="field">
          <label htmlFor="name">Имя этого человека (для приветствия)</label>
          <input
            id="name"
            value={myName}
            onChange={(e) => setMyName(e.target.value)}
            placeholder="Например: Мама"
          />
        </div>

        <div className="field">
          <label htmlFor="peer">Кому он(а) звонит (для кнопки)</label>
          <input
            id="peer"
            value={peerName}
            onChange={(e) => setPeerName(e.target.value)}
            placeholder="Например: Артёму"
          />
        </div>

        {saved && <div className="saved-note">✅ Сохранено на этом устройстве</div>}

        <button className="primary-button" onClick={save}>
          Сохранить
        </button>
        <Link href="/" className="secondary-button">
          На главную
        </Link>
      </div>
    </main>
  );
}

export default function SetupPage() {
  return (
    <Suspense fallback={<main className="centered">Загрузка…</main>}>
      <SetupInner />
    </Suspense>
  );
}
