"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { useKadiApi } from "@/lib/api";
import { GameTable } from "@/components/game-table";
import { ChatPanel } from "@/components/chat-panel";

const roomCodePattern = /^[A-Z][0-9]{4}$/;
const nameSchema = z
  .string()
  .transform((value) =>
    [...value]
      .filter((character) => {
        const code = character.charCodeAt(0);
        return !(code < 32 || (code >= 127 && code <= 159));
      })
      .join("")
      .trim(),
  )
  .pipe(z.string().min(2).max(20));

const errorMessages: Record<string, string> = {
  INVALID_PAYLOAD: "Check the name and room code, then try again.",
  RATE_LIMITED: "Too many join attempts. Wait a moment and try again.",
  ALREADY_IN_ROOM: "You’re already in a room on this connection.",
  ROOM_NOT_FOUND: "That room code wasn’t found. Check it and try again.",
  ROOM_CLOSED: "That room is closed because its game has already started.",
  ROOM_FULL: "That room is full. Ask the host for another room code.",
  NAME_TAKEN: "That name is already being used in this room.",
  FORBIDDEN: "Only the room owner can do that.",
  INVALID_TARGET: "That player is no longer in the room.",
  START_REJECTED: "At least two players are needed to start.",
  UNAUTHENTICATED:
    "You were removed from the room or your guest session expired.",
  CONFLICT: "The table changed. Refresh and try that action again.",
  ACTION_REJECTED:
    "That move isn’t legal right now. Check the table and try again.",
  GAME_FINISHED: "The game has ended, so chat is closed.",
  SERVICE_UNAVAILABLE: "The game service is temporarily unavailable.",
  SERVER_UNAVAILABLE: "The game server is unavailable. Please try again.",
  INVALID_SERVER_RESPONSE: "The server sent an invalid response. Reconnect.",
  REQUEST_FAILED: "That didn’t work. Please try again.",
};

type EntryMode = "create" | "join" | null;

export default function Home() {
  const [mode, setMode] = useState<EntryMode>(null);
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const {
    room,
    playerId,
    gameView,
    connected,
    connectionStatus,
    serverTimeOffsetMs,
    connectionError,
    chatMessages,
    clearRoom,
    emit,
  } = useKadiApi();

  useEffect(() => {
    const sharedCode = new URLSearchParams(window.location.search).get("room");
    if (sharedCode && roomCodePattern.test(sharedCode)) {
      setRoomCode(sharedCode);
      setMode("join");
    }
  }, []);

  useEffect(() => {
    if (connectionError)
      setError(errorMessages[connectionError] ?? errorMessages.REQUEST_FAILED);
  }, [connectionError]);

  const isOwner = room?.ownerId === playerId;
  const playerCount = room?.players.length ?? 0;
  const formattedError = useMemo(
    () => (error ? (errorMessages[error] ?? error) : null),
    [error],
  );

  const submitRoom = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setNotice(null);
      if (!connected) {
        setError("SERVER_UNAVAILABLE");
        return;
      }
      const checkedName = nameSchema.safeParse(name);
      if (!checkedName.success) {
        setError("Choose a name between 2 and 20 characters.");
        return;
      }
      if (mode === "join" && !roomCodePattern.test(roomCode)) {
        setError(
          "Enter a room code with one capital letter followed by four digits.",
        );
        return;
      }
      setBusy(true);
      const result =
        mode === "create"
          ? await emit("room:create", { name: checkedName.data })
          : await emit("room:join", {
              name: checkedName.data,
              code: roomCode,
            });
      setBusy(false);
      if (!result.ok) {
        setError(result.code ?? "REQUEST_FAILED");
        return;
      }
      setName(checkedName.data);
      setRoomCode(roomCode);
      setMode(null);
    },
    [connected, emit, mode, name, roomCode],
  );

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(room?.code ?? roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError("Copy isn’t available in this browser. Share the code instead.");
    }
  };

  const shareRoom = async () => {
    const code = room?.code ?? roomCode;
    const url = `${window.location.origin}/?room=${encodeURIComponent(code)}`;
    try {
      if (navigator.share)
        await navigator.share({ title: "Join my Kadi room", url });
      else {
        await navigator.clipboard.writeText(url);
        setNotice("Share link copied.");
      }
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === "AbortError")
        return;
      setError("Couldn’t share the link. Copy the room code instead.");
    }
  };

  const ownerAction = async (
    event: "room:kick",
    payload: { playerId: string },
  ) => {
    setError(null);
    const result = await emit(event, payload);
    if (!result.ok) setError(result.code ?? "REQUEST_FAILED");
  };

  const startGame = async () => {
    setError(null);
    const result = await emit("game:start", {});
    if (!result.ok) setError(result.code ?? "START_REJECTED");
  };

  const toggleMute = async (targetId: string, muted: boolean) => {
    setError(null);
    const result = await emit("room:mute", { playerId: targetId, muted });
    if (!result.ok) setError(result.code ?? "REQUEST_FAILED");
  };

  const leaveGame = async () => {
    const result = await emit("room:leave", {});
    if (!result.ok) return false;
    clearRoom();
    setMode(null);
    setError(null);
    return true;
  };

  if (room?.started) {
    return (
      <GameTable
        connected={connected}
        chatMessages={chatMessages}
        emit={emit}
        gameView={gameView}
        connectionStatus={connectionStatus}
        muted={
          room.players.find((player) => player.id === playerId)?.muted ?? false
        }
        onLeave={leaveGame}
        playerId={playerId}
        room={room}
        serverTimeOffsetMs={serverTimeOffsetMs}
      />
    );
  }

  if (room) {
    return (
      <main className="kadi-concrete min-h-screen px-4 pb-10 pt-5 sm:px-8 sm:pt-8">
        <div className="mx-auto w-full max-w-6xl">
          <header className="flex items-center justify-between">
            <Link className="text-xl font-black tracking-tight" href="/">
              KADI<span className="text-[#cf5939]">.</span>
            </Link>
            <span className="rounded-full border border-[#d9d0c2] px-3 py-1 text-xs font-semibold text-[#59645c]">
              {!connected
                ? "Reconnecting…"
                : connectionStatus === "realtime"
                  ? "Live"
                  : connectionStatus === "polling"
                    ? "Polling"
                    : "Connecting…"}
            </span>
          </header>

          <div className="mt-8 grid gap-6 sm:mt-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <section className="kadi-poster-panel rounded-[2rem] bg-[#fffdf8] p-5 text-[#1c2822] shadow-[0_20px_70px_-44px_rgba(28,40,34,0.35)] sm:p-9">
              <div className="flex flex-col gap-5 border-b border-[#e8e0d4] pb-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#cf5939]">
                    Waiting room
                  </p>
                  <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                    Your table is ready.
                  </h1>
                  <p className="mt-2 text-sm text-[#657067]">
                    Share the code and bring your people in.
                  </p>
                </div>
                <div className="rounded-2xl bg-[#f1eadf] px-5 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#68736b]">
                    Room code
                  </p>
                  <p className="mt-1 font-mono text-3xl font-black tracking-[0.16em]">
                    {room.code}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  className="min-h-11 rounded-xl border border-[#d8d0c3] px-4 text-sm font-bold hover:bg-[#f6f1e9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#cf5939]"
                  onClick={() => void copyRoomCode()}
                  type="button"
                >
                  {copied ? "Copied" : "Copy code"}
                </button>
                <button
                  className="min-h-11 rounded-xl border border-[#d8d0c3] px-4 text-sm font-bold hover:bg-[#f6f1e9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#cf5939]"
                  onClick={() => void shareRoom()}
                  type="button"
                >
                  Share link
                </button>
              </div>

              {notice && (
                <p
                  className="mt-3 text-sm font-semibold text-[#39714d]"
                  role="status"
                >
                  {notice}
                </p>
              )}
              {formattedError && <ErrorBanner message={formattedError} />}

              <div className="mt-8 flex items-end justify-between">
                <div>
                  <h2 className="text-xl font-extrabold">Players</h2>
                  <p className="mt-1 text-sm text-[#657067]">
                    {playerCount} of 6 seats filled
                  </p>
                </div>
                <span className="text-sm font-semibold text-[#657067]">
                  {playerCount < 2 ? "Waiting for one more…" : "Ready to play"}
                </span>
              </div>

              <ul className="mt-4 space-y-2">
                {room.players.map((player) => (
                  <li
                    className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-[#eee7db] bg-white px-4 py-3"
                    key={player.id}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#e6eee4] text-sm font-black text-[#39714d]"
                      >
                        {player.name.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-bold">{player.name}</p>
                        <div className="mt-0.5 flex flex-wrap gap-2 text-xs font-semibold text-[#707a71]">
                          {player.id === room.ownerId && (
                            <span className="text-[#a44b32]">Owner</span>
                          )}
                          {player.id === playerId && <span>You</span>}
                          {!player.connected && <span>Reconnecting</span>}
                          {player.muted && <span>Muted in chat</span>}
                        </div>
                      </div>
                    </div>
                    {isOwner && player.id !== playerId && (
                      <div className="flex shrink-0 gap-2">
                        <button
                          aria-label={`${player.muted ? "Unmute" : "Mute"} ${player.name}`}
                          className="min-h-10 rounded-lg border border-[#d8d0c3] px-3 text-xs font-bold hover:bg-[#f6f1e9] focus-visible:outline-2 focus-visible:outline-[#cf5939]"
                          onClick={() =>
                            void toggleMute(player.id, !player.muted)
                          }
                          type="button"
                        >
                          {player.muted ? "Unmute" : "Mute"}
                        </button>
                        <button
                          aria-label={`Kick ${player.name}`}
                          className="min-h-10 rounded-lg border border-[#ead0c7] px-3 text-xs font-bold text-[#a3422d] hover:bg-[#fff1eb] focus-visible:outline-2 focus-visible:outline-[#cf5939]"
                          onClick={() =>
                            void ownerAction("room:kick", {
                              playerId: player.id,
                            })
                          }
                          type="button"
                        >
                          Kick
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              {room.started ? (
                <div className="mt-7 rounded-2xl bg-[#eaf0e6] p-4 text-sm font-semibold text-[#315e40]">
                  Game started. The game table will appear here.
                  {gameView?.winner && " A winner has been decided."}
                </div>
              ) : (
                <div className="mt-7">
                  {isOwner ? (
                    <button
                      className="kadi-sticker-button min-h-14 w-full rounded-2xl bg-[#c64f32] px-5 text-base font-extrabold text-white shadow-lg shadow-[#c64f32]/20 transition hover:bg-[#ae422a] disabled:cursor-not-allowed disabled:bg-[#c9b9a8] disabled:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2822]"
                      disabled={playerCount < 2 || !connected}
                      onClick={() => void startGame()}
                      type="button"
                    >
                      Start game
                    </button>
                  ) : (
                    <p className="rounded-2xl bg-[#f1eadf] px-4 py-4 text-center text-sm font-semibold text-[#59645c]">
                      The owner will start the game when everyone is ready.
                    </p>
                  )}
                </div>
              )}
            </section>
            <ChatPanel
              connected={connected}
              emit={emit}
              messages={chatMessages}
              muted={
                room.players.find((player) => player.id === playerId)?.muted ??
                false
              }
            />
          </div>
          <p className="mt-5 text-center text-xs text-[#788178]">
            Kadi is best with friends around the table—even from miles away.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="kadi-concrete min-h-screen overflow-hidden px-4 pb-28 sm:px-8 sm:pb-10">
      <div className="mx-auto w-full max-w-6xl">
        <header className="flex items-center justify-between py-5 sm:py-7">
          <Link className="text-xl font-black tracking-tight" href="/">
            KADI<span className="text-[#cf5939]">.</span>
          </Link>
          <span className="rounded-full border border-[#d9d0c2] px-3 py-1 text-xs font-semibold text-[#59645c]">
            {connected ? "Ready when you are" : "Connecting…"}
          </span>
        </header>

        <section className="relative grid min-h-[calc(100svh-6rem)] items-center gap-8 py-6 sm:py-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div className="relative z-10">
            <p className="inline-flex items-center gap-2 rounded-full bg-[#e8eee3] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[#39714d]">
              <span
                aria-hidden="true"
                className="size-2 rounded-full bg-[#4b8a5e]"
              />
              The table is open
            </p>
            <h1 className="mt-5 max-w-xl text-5xl font-black leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
              Good cards.
              <br />
              <span className="text-[#c64f32]">Better company.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-[#657067] sm:text-lg">
              Bring your crew together for Kadi. Make a room, share the code,
              and let the cards fall where they may.
            </p>

            <div className="mt-7 grid grid-cols-2 gap-3 sm:max-w-md">
              <button
                className="kadi-sticker-button min-h-14 rounded-2xl bg-[#c64f32] px-4 text-sm font-extrabold text-white shadow-lg shadow-[#c64f32]/20 transition hover:-translate-y-0.5 hover:bg-[#ae422a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2822]"
                onClick={() => {
                  setMode("create");
                  setError(null);
                }}
                type="button"
              >
                Create room
              </button>
              <button
                className="kadi-sticker-button min-h-14 rounded-2xl border-2 border-[#d8d0c3] bg-[#fffdf8] px-4 text-sm font-extrabold text-[#1c2822] transition hover:-translate-y-0.5 hover:border-[#c64f32] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c64f32]"
                onClick={() => {
                  setMode("join");
                  setError(null);
                }}
                type="button"
              >
                Join a room
              </button>
            </div>

            {mode && (
              <form
                className="mt-5 grid gap-3 rounded-3xl border border-[#e7dfd3] bg-[#fffdf8] p-4 text-[#1c2822] shadow-[0_20px_70px_-44px_rgba(28,40,34,0.4)] sm:max-w-md sm:p-5"
                onSubmit={(event) => void submitRoom(event)}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-extrabold">
                    {mode === "create"
                      ? "Create your table"
                      : "Join your friends"}
                  </h2>
                  <button
                    aria-label="Close form"
                    className="flex size-9 items-center justify-center rounded-full text-xl text-[#657067] hover:bg-[#f1eadf] focus-visible:outline-2 focus-visible:outline-[#cf5939]"
                    onClick={() => setMode(null)}
                    type="button"
                  >
                    ×
                  </button>
                </div>
                <label
                  className="grid gap-1.5 text-sm font-bold"
                  htmlFor="player-name"
                >
                  Your name
                  <input
                    autoComplete="nickname"
                    className="min-h-12 rounded-xl border border-[#d8d0c3] bg-white px-3 font-medium outline-none placeholder:text-[#9aa097] focus:border-[#c64f32] focus:ring-2 focus:ring-[#c64f32]/15"
                    id="player-name"
                    maxLength={40}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="What should we call you?"
                    required
                    value={name}
                  />
                </label>
                {mode === "join" && (
                  <label
                    className="grid gap-1.5 text-sm font-bold"
                    htmlFor="room-code"
                  >
                    Room code
                    <input
                      autoCapitalize="characters"
                      autoComplete="off"
                      className="min-h-12 rounded-xl border border-[#d8d0c3] bg-white px-3 font-mono text-lg font-bold uppercase tracking-[0.14em] outline-none placeholder:font-sans placeholder:text-sm placeholder:font-medium placeholder:tracking-normal placeholder:text-[#9aa097] focus:border-[#c64f32] focus:ring-2 focus:ring-[#c64f32]/15"
                      id="room-code"
                      maxLength={5}
                      onChange={(event) =>
                        setRoomCode(
                          event.target.value
                            .toUpperCase()
                            .replace(/[^A-Z0-9]/g, "")
                            .slice(0, 5),
                        )
                      }
                      pattern="[A-Z][0-9]{4}"
                      placeholder="e.g. K4821"
                      required
                      value={roomCode}
                    />
                    <span className="text-xs font-medium text-[#737e74]">
                      One letter followed by four numbers.
                    </span>
                  </label>
                )}
                {formattedError && <ErrorBanner message={formattedError} />}
                <button
                  className="mt-1 min-h-12 rounded-xl bg-[#1c2822] px-4 font-extrabold text-white hover:bg-[#304237] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c64f32]"
                  disabled={busy || !connected}
                  type="submit"
                >
                  {busy
                    ? "One moment…"
                    : mode === "create"
                      ? "Create room"
                      : "Join room"}
                </button>
                {!connected && (
                  <p className="text-center text-xs text-[#788178]">
                    Connecting to the game server…
                  </p>
                )}
              </form>
            )}

            {!mode && formattedError && (
              <ErrorBanner message={formattedError} />
            )}

            <p className="mt-7 text-xs font-medium text-[#788178]">
              2–6 players · No account needed · Just bring your game face
            </p>
          </div>

          <div
            aria-hidden="true"
            className="relative mx-auto flex aspect-square w-full max-w-[27rem] items-center justify-center lg:max-w-none"
          >
            <div className="absolute inset-[8%] rounded-full border border-[#e5dccd]" />
            <div className="absolute inset-[17%] rounded-full border border-dashed border-[#ded3c1]" />
            <div className="absolute left-[11%] top-[24%] h-28 w-20 rotate-[-18deg] rounded-xl border border-[#e5dccd] bg-[#fffdf8] shadow-md sm:h-36 sm:w-24" />
            <div className="absolute right-[10%] top-[25%] h-28 w-20 rotate-[16deg] rounded-xl border border-[#e5dccd] bg-[#fffdf8] shadow-md sm:h-36 sm:w-24">
              <span className="absolute left-2 top-2 text-lg font-black text-[#c64f32]">
                K
              </span>
              <span className="absolute bottom-2 right-2 rotate-180 text-lg font-black text-[#c64f32]">
                K
              </span>
            </div>
            <div className="relative z-10 flex h-56 w-40 -rotate-[4deg] flex-col justify-between rounded-2xl border border-[#e5dccd] bg-[#fffdf8] p-4 shadow-[0_30px_70px_-22px_rgba(28,40,34,0.25)] sm:h-64 sm:w-48 sm:p-5">
              <div className="text-xl font-black leading-none text-[#39714d]">
                7<span className="mt-1 block text-2xl">♣</span>
              </div>
              <div className="text-center text-6xl font-black text-[#39714d] sm:text-7xl">
                ♣
              </div>
              <div className="rotate-180 text-xl font-black leading-none text-[#39714d]">
                7<span className="mt-1 block text-2xl">♣</span>
              </div>
            </div>
            <span className="absolute bottom-[13%] left-[13%] rounded-full bg-[#e6eee4] px-4 py-2 text-xs font-bold text-[#39714d]">
              Your move.
            </span>
            <span className="absolute right-[8%] top-[12%] rounded-full bg-[#f4dfd5] px-4 py-2 text-xs font-bold text-[#a44b32]">
              Niko Kadi!
            </span>
          </div>
        </section>
        <SiteFooter />
      </div>
      {!mode && (
        <nav
          aria-label="Quick room actions"
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 gap-3 border-t-2 border-black bg-[#f8f7f1] p-3 shadow-[0_-5px_0_#bb0000] sm:hidden"
        >
          <button
            className="kadi-sticker-button min-h-12 rounded-xl bg-[#bb0000] px-3 text-sm font-extrabold text-white"
            onClick={() => {
              setMode("create");
              setError(null);
            }}
            type="button"
          >
            Create room
          </button>
          <button
            className="kadi-sticker-button min-h-12 rounded-xl bg-white px-3 text-sm font-extrabold text-black"
            onClick={() => {
              setMode("join");
              setError(null);
            }}
            type="button"
          >
            Join room
          </button>
        </nav>
      )}
    </main>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-white/20 py-6 text-sm text-white/80">
      <nav
        aria-label="Site information"
        className="flex flex-wrap justify-center gap-x-5 gap-y-2"
      >
        <Link
          className="underline underline-offset-4 hover:text-white"
          href="/how-to-play"
        >
          How to play
        </Link>
        <Link
          className="underline underline-offset-4 hover:text-white"
          href="/about"
        >
          About
        </Link>
        <Link
          className="underline underline-offset-4 hover:text-white"
          href="/feedback"
        >
          Feedback
        </Link>
        <Link
          className="underline underline-offset-4 hover:text-white"
          href="/privacy"
        >
          Privacy
        </Link>
      </nav>
      <p className="mt-3 text-center text-xs">
        Kadi, made for playing together.
      </p>
    </footer>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      className="mt-3 rounded-xl border border-[#f0c8bb] bg-[#fff1eb] px-3 py-2.5 text-sm font-semibold text-[#9e3f2b]"
      role="alert"
    >
      {message}
    </p>
  );
}
