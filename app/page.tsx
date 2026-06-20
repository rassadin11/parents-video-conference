"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Home() {
  const [myName, setMyName] = useState("");
  const [peerName, setPeerName] = useState("");

  useEffect(() => {
    setMyName(localStorage.getItem("myName") ?? "");
    setPeerName(localStorage.getItem("peerName") ?? "");
  }, []);

  return (
    <main className="home">
      <h1 className="greeting">
        {myName ? `Здравствуй, ${myName}!` : "Здравствуй!"}
      </h1>

      <Link href="/call" className="call-button" aria-label="Позвонить">
        <span className="call-icon" aria-hidden>
          📞
        </span>
        <span>{peerName ? `Позвонить ${peerName}` : "Позвонить"}</span>
      </Link>

      <p className="hint">Нажми большую зелёную кнопку, чтобы начать видеозвонок</p>
    </main>
  );
}
