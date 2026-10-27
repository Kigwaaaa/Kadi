"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChatPanel } from "@/components/chat-panel";
import { Card, CardBack, CardFace, getCardName } from "@/components/card";
import type {
  ChatMessage,
  ClientToServerEvents,
  PrivateGameView,
  KadiEmit,
  RoomState,
} from "@/lib/api";

const suits = [
  { value: "clubs", label: "Clubs", glyph: "♣" },
  { value: "diamonds", label: "Diamonds", glyph: "♦" },
  { value: "hearts", label: "Hearts", glyph: "♥" },
  { value: "spades", label: "Spades", glyph: "♠" },
] as const;
const numberRanks = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

type Suit = (typeof suits)[number]["value"];
type AceChoice = { suit?: Suit; rank?: number };

const friendlyActionError = (code?: string) => {
  if (code === "RATE_LIMITED") return "A moment—too many actions too quickly.";
  if (code === "FORBIDDEN") return "Only the room owner can do that.";
  if (code === "INVALID_TARGET")
    return "That player is no longer at the table.";
  if (code === "GAME_NOT_ACTIVE") return "This game is no longer active.";
  if (code === "RESTART_REJECTED")
    return "The game can’t be restarted right now.";
  return "That move isn’t legal right now. Check the table and try again.";
};

function PlayerSeat({
  id,
  name,
  cardCount,
  current,
  self,
  nikoKadiPressed,
}: {
  id: string;
  name: string;
  cardCount: number;
  current: boolean;
  self: boolean;
  nikoKadiPressed: boolean;
}) {
  return (
    <li
      aria-current={current ? "step" : undefined}
      className={`min-w-36 rounded-2xl border px-3 py-2 ${
        current
          ? "border-[#d7894f] bg-[#fff2e5] shadow-md ring-2 ring-[#d7894f]/35"
          : "border-[#e8dfd2] bg-[#fffdf8]"
      }`}
      key={id}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-black ${
              current ? "bg-[#c64f32] text-white" : "bg-[#315e40] text-white"
            }`}
          >
            {name.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold">
              {name}
              {self && (
                <span className="ml-1 text-xs font-semibold">(you)</span>
              )}
            </p>
            <p className="mt-0.5 text-xs font-semibold text-[#68736b]">
              {cardCount} {cardCount === 1 ? "card" : "cards"}
            </p>
          </div>
        </div>
        <span
          aria-label={current ? "Current turn" : "Waiting"}
          className={`size-2.5 shrink-0 rounded-full ${
            current ? "bg-[#c64f32]" : "bg-[#d9d2c7]"
          }`}
        />
      </div>
      {nikoKadiPressed && (
        <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-[#a44831]">
          Niko Kadi!
        </p>
      )}
    </li>
  );
}

export function GameTable({
  room,
  gameView,
  playerId,
  emit,
  connected,
  connectionStatus,
  serverTimeOffsetMs,
  chatMessages,
  muted,
  onLeave,
}: {
  room: RoomState;
  gameView: PrivateGameView | null;
  playerId: string | null;
  emit: KadiEmit;
  connected: boolean;
  connectionStatus: "connecting" | "realtime" | "polling" | "reconnecting";
  serverTimeOffsetMs: number;
  chatMessages: ChatMessage[];
  muted: boolean;
  onLeave: () => Promise<boolean>;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [acePickerOpen, setAcePickerOpen] = useState(false);
  const [aceChoice, setAceChoice] = useState<AceChoice>({});
  const [countdownNow, setCountdownNow] = useState(
    Date.now() + serverTimeOffsetMs,
  );
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ownPlayer = gameView?.players.find((player) => player.id === playerId);
  const hand = ownPlayer?.hand ?? [];
  const selectedCards = hand.filter((card) => selectedIds.includes(card.id));
  const selectedAces = selectedCards.filter((card) => card.rank === "A");
  const roomPlayers = new Map(
    room.players.map((player) => [player.id, player]),
  );
  const isOwner = room.ownerId === playerId;
  const actionWindow = gameView?.window;
  const pendingAceChoice = gameView?.pendingAceChoice;
  const remainingMs = actionWindow
    ? Math.max(0, actionWindow.deadline - countdownNow)
    : 0;
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const turnIsYours =
    !!gameView &&
    !gameView.winner &&
    !actionWindow &&
    !pendingAceChoice &&
    gameView.currentPlayerId === playerId;
  const handRank = selectedCards[0]?.rank;
  const directionLabel =
    gameView?.direction === 1 ? "Clockwise" : "Counter-clockwise";
  const activePenalty = gameView?.pendingPenalty?.amount;
  const namedPlayers =
    gameView?.players.map((player) => ({
      ...player,
      name: roomPlayers.get(player.id)?.name ?? "Player",
    })) ?? [];

  useEffect(() => {
    if (!actionWindow) return;
    setCountdownNow(Date.now() + serverTimeOffsetMs);
    const interval = globalThis.setInterval(
      () => setCountdownNow(Date.now() + serverTimeOffsetMs),
      100,
    );
    return () => globalThis.clearInterval(interval);
  }, [actionWindow?.deadline, serverTimeOffsetMs]);

  useEffect(() => {
    if (!toast) return;
    const timeout = globalThis.setTimeout(() => setToast(null), 3_500);
    return () => globalThis.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    setSelectedIds([]);
    setAcePickerOpen(false);
  }, [gameView?.currentPlayerId, gameView?.discard.length, gameView?.winner]);

  const runAction = async <E extends keyof ClientToServerEvents>(
    event: E,
    payload: Parameters<ClientToServerEvents[E]>[0],
  ) => {
    if (!connected || busy) {
      if (!connected) setToast("Connection lost. Reconnect before acting.");
      return false;
    }
    setBusy(true);
    const result = await emit(event, payload);
    setBusy(false);
    if (!result.ok) {
      setToast(friendlyActionError(result.code));
      return false;
    }
    setToast(null);
    return true;
  };

  const leave = async () => {
    if (!(await onLeave()))
      setToast("Couldn’t leave the room. Check your connection and try again.");
  };

  const toggleCard = (cardId: string) => {
    setSelectedIds((current) => {
      if (current.includes(cardId))
        return current.filter((selected) => selected !== cardId);
      const card = hand.find((item) => item.id === cardId);
      if (!card) return current;
      if (current.length && handRank !== card.rank) {
        setToast("A multi-card play must use cards of the same rank.");
        return current;
      }
      if (card.rank === "A" && current.length >= 2) {
        setToast("You may play at most two Aces at once.");
        return current;
      }
      setToast(null);
      return [...current, cardId];
    });
  };

  const playSelected = async () => {
    if (selectedIds.length === 0) {
      setToast("Choose a card from your hand first.");
      return;
    }
    if (selectedAces.length) {
      setAceChoice({});
      setAcePickerOpen(true);
      return;
    }
    if (
      await runAction("game:play", {
        cardIds: selectedIds,
      })
    ) {
      setSelectedIds([]);
    }
  };

  const submitAcePlay = async () => {
    const choiceIsComplete =
      selectedAces.length === 2
        ? aceChoice.suit !== undefined && aceChoice.rank !== undefined
        : (aceChoice.suit !== undefined) !== (aceChoice.rank !== undefined);
    if (!choiceIsComplete) {
      setToast(
        selectedAces.length === 2
          ? "Choose both a suit and a number for two Aces."
          : "Choose either a suit or a number.",
      );
      return;
    }
    if (
      await runAction("game:play", {
        cardIds: selectedIds,
        aceRequest: aceChoice,
      })
    ) {
      setAcePickerOpen(false);
      setSelectedIds([]);
    }
  };

  const playCounter = async (
    kind: "king" | "jack" | "ace",
    cardIds: string[],
  ) => {
    if (
      await runAction("game:counter", {
        kind,
        cardIds,
      })
    ) {
      setSelectedIds([]);
    }
  };

  const nextName =
    namedPlayers.find((player) => player.id === gameView?.currentPlayerId)
      ?.name ?? "Next player";
  const winnerName =
    namedPlayers.find((player) => player.id === gameView?.winner)?.name ??
    "A player";
  const ringProgress = actionWindow
    ? Math.min(
        1,
        Math.max(
          0,
          remainingMs /
            Math.max(1, actionWindow.deadline - actionWindow.openedAt),
        ),
      )
    : 0;

  if (!gameView) {
    return (
      <main className="kadi-concrete min-h-screen px-4 py-5 sm:px-8 sm:py-8">
        <section className="kadi-poster-panel mx-auto max-w-2xl rounded-[2rem] bg-[#fffdf8] p-6 text-[#1c2822] shadow-xl sm:p-10">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#c64f32]">
            {room.code}
          </p>
          <h1 className="mt-2 text-3xl font-black">
            {room.ended ? "The game has ended." : "The table is reconnecting."}
          </h1>
          <p className="mt-3 text-sm text-[#657067]">
            {room.ended
              ? "The owner can start a fresh game for everyone."
              : "The latest table state is not available yet."}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {isOwner && room.ended && (
              <button
                className={primaryButtonClass}
                disabled={busy || !connected}
                onClick={() =>
                  void runAction("game:restart", {}).then((ok) => {
                    if (ok) setToast(null);
                  })
                }
                type="button"
              >
                Play again
              </button>
            )}
            <button
              className={secondaryButtonClass}
              onClick={() => void leave()}
              type="button"
            >
              Leave
            </button>
          </div>
          {toast && <Toast message={toast} />}
        </section>
      </main>
    );
  }

  if (gameView.winner) {
    return (
      <main className="kadi-concrete min-h-screen px-4 py-5 sm:px-8 sm:py-8">
        <section
          aria-labelledby="winner-heading"
          className="kadi-poster-panel mx-auto mt-8 max-w-2xl rounded-[2rem] bg-[#fffdf8] p-6 text-center text-[#1c2822] shadow-[0_24px_80px_-42px_rgba(28,40,34,0.4)] sm:mt-16 sm:p-12"
        >
          <span aria-hidden="true" className="text-5xl">
            ♣
          </span>
          <p className="mt-3 text-xs font-black uppercase tracking-[0.22em] text-[#c64f32]">
            Game over
          </p>
          <h1
            className="mt-2 text-4xl font-black tracking-tight sm:text-5xl"
            id="winner-heading"
          >
            {winnerName} wins!
          </h1>
          <p className="mt-3 text-[#657067]">
            A fine hand and a well-timed Niko Kadi.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            {isOwner && (
              <button
                className={primaryButtonClass}
                disabled={busy || !connected}
                onClick={() => void runAction("game:restart", {})}
                type="button"
              >
                Play again
              </button>
            )}
            <button
              className={secondaryButtonClass}
              onClick={() => void leave()}
              type="button"
            >
              Leave
            </button>
          </div>
          {toast && <Toast message={toast} />}
        </section>
      </main>
    );
  }

  const kings = hand.filter((card) => card.rank === "K");
  const jacks = hand.filter((card) => card.rank === "J");
  const aces = hand.filter((card) => card.rank === "A");
  const isAceResponder =
    !!gameView.activeAceRequest &&
    gameView.activeAceRequest.byPlayerId !== playerId &&
    !pendingAceChoice &&
    (actionWindow
      ? actionWindow.nextPlayerId === playerId
      : gameView.currentPlayerId === playerId);
  const isWindowActor =
    !!actionWindow &&
    actionWindow.actorId === playerId &&
    (actionWindow.actionType === "play" ||
      actionWindow.actionType === "counter");
  const nikosAvailable =
    isWindowActor &&
    gameView.players.every((player) => player.cardCount > 0) &&
    !ownPlayer?.nikoKadiPressed;

  return (
    <main className="kadi-concrete min-h-screen px-3 pb-8 pt-4 sm:px-6 sm:pt-6 lg:mx-auto lg:grid lg:max-w-[92rem] lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-6">
      <div className="mx-auto w-full max-w-6xl lg:max-w-none">
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Link
              aria-label="Kadi home"
              className="text-xl font-black tracking-tight"
              href="/"
            >
              KADI<span className="text-[#cf5939]">.</span>
            </Link>
            <p className="truncate text-xs font-semibold text-[#68736b]">
              Room {room.code}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              aria-label={
                !connected
                  ? "Reconnecting to game server"
                  : connectionStatus === "realtime"
                    ? "Connected with live updates"
                    : "Connected with polling updates"
              }
              className="rounded-full border border-[#d9d0c2] px-3 py-1 text-xs font-semibold text-[#59645c]"
            >
              {!connected
                ? "Reconnecting…"
                : connectionStatus === "realtime"
                  ? "Live"
                  : connectionStatus === "polling"
                    ? "Polling"
                    : "Connecting…"}
            </span>
            <details className="relative">
              <summary
                aria-label="Owner menu"
                className="flex min-h-10 cursor-pointer list-none items-center rounded-xl border border-[#d8d0c3] px-3 text-sm font-bold hover:bg-white focus-visible:outline-2 focus-visible:outline-[#cf5939]"
              >
                {isOwner ? "Owner menu" : "Menu"}
              </summary>
              <div className="absolute right-0 z-30 mt-2 grid w-56 gap-1 rounded-2xl border border-[#e4dbce] bg-[#fffdf8] p-2 shadow-xl">
                {isOwner && (
                  <>
                    <button
                      className={menuButtonClass}
                      disabled={busy || !connected}
                      onClick={() => void runAction("game:end", {})}
                      type="button"
                    >
                      End game
                    </button>
                    <button
                      className={menuButtonClass}
                      disabled={busy || !connected}
                      onClick={() => void runAction("game:restart", {})}
                      type="button"
                    >
                      Restart game
                    </button>
                  </>
                )}
                {room.players
                  .filter((player) => player.id !== playerId)
                  .map((player) => (
                    <div
                      className="flex items-center justify-between gap-2 border-t border-[#eee7db] px-2 py-2"
                      key={player.id}
                    >
                      <span className="max-w-24 truncate text-xs font-bold">
                        {player.name}
                      </span>
                      {isOwner && (
                        <>
                          <button
                            aria-label={`${player.muted ? "Unmute" : "Mute"} ${player.name}`}
                            className={miniMenuButtonClass}
                            disabled={busy || !connected}
                            onClick={() =>
                              void runAction("room:mute", {
                                playerId: player.id,
                                muted: !player.muted,
                              })
                            }
                            type="button"
                          >
                            {player.muted ? "Unmute" : "Mute"}
                          </button>
                          <button
                            aria-label={`Kick ${player.name}`}
                            className={`${miniMenuButtonClass} text-[#a3422d]`}
                            disabled={busy || !connected}
                            onClick={() =>
                              void runAction("room:kick", {
                                playerId: player.id,
                              })
                            }
                            type="button"
                          >
                            Kick
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                <button
                  className={`${menuButtonClass} border-t border-[#eee7db] text-[#a3422d]`}
                  onClick={() => void leave()}
                  type="button"
                >
                  Leave room
                </button>
              </div>
            </details>
          </div>
        </header>

        <section
          aria-label="Kadi game table"
          className="mt-4 rounded-[1.75rem] border border-[#dfd5c6] bg-[#e4eadf] p-3 shadow-[0_20px_70px_-42px_rgba(28,40,34,0.45)] sm:mt-6 sm:rounded-[2.5rem] sm:p-6"
        >
          <div className="rounded-[1.35rem] border border-[#cbd5c5] bg-[#edf1e8] p-3 sm:rounded-[2rem] sm:p-5">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span
                aria-label={`Play direction: ${directionLabel}`}
                className="rounded-full border border-[#d2dbcd] bg-[#fffdf8] px-3 py-1.5 text-xs font-extrabold text-[#45594a]"
              >
                {gameView.direction === 1 ? "↻" : "↺"} {directionLabel}
              </span>
              {activePenalty && (
                <span
                  className="rounded-full bg-[#f8e0d8] px-3 py-1.5 text-xs font-extrabold text-[#9e3f2b]"
                  role="status"
                >
                  Penalty: draw {activePenalty}
                </span>
              )}
              {gameView.activeAceRequest && (
                <span
                  className="rounded-full bg-[#eee5f4] px-3 py-1.5 text-xs font-extrabold text-[#68467d]"
                  role="status"
                >
                  {pendingAceChoice
                    ? `Ace choice: ${roomPlayers.get(pendingAceChoice.chooserId)?.name ?? "player"} deciding`
                    : `Ace request: ${[
                        gameView.activeAceRequest.suit
                          ? suits.find(
                              (suit) =>
                                suit.value === gameView.activeAceRequest?.suit,
                            )?.label
                          : null,
                        gameView.activeAceRequest.rank
                          ? `number ${gameView.activeAceRequest.rank}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" + ")}`}
                </span>
              )}
              {gameView.pendingJackCounters && (
                <span
                  className="rounded-full bg-[#fff0cd] px-3 py-1.5 text-xs font-extrabold text-[#79551b]"
                  role="status"
                >
                  Skip pending for{" "}
                  {roomPlayers.get(gameView.pendingJackCounters.playerId)
                    ?.name ?? "next player"}
                  {gameView.pendingJackCounters.remainingSkips > 1
                    ? ` · ${gameView.pendingJackCounters.remainingSkips} skips`
                    : ""}
                </span>
              )}
              {gameView.pendingKingCounter && (
                <span
                  className="rounded-full bg-[#e3e9fa] px-3 py-1.5 text-xs font-extrabold text-[#42568b]"
                  role="status"
                >
                  King counter window
                </span>
              )}
            </div>

            <ul
              aria-label="Players and card counts"
              className="mx-auto mt-3 flex max-w-5xl flex-wrap justify-center gap-2 pb-2"
            >
              {namedPlayers
                .filter((player) => player.id !== playerId)
                .map((player) => (
                  <PlayerSeat
                    cardCount={player.cardCount}
                    current={player.id === gameView.currentPlayerId}
                    id={player.id}
                    key={player.id}
                    name={player.name}
                    nikoKadiPressed={player.nikoKadiPressed}
                    self={false}
                  />
                ))}
            </ul>

            <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:mt-6 sm:gap-5">
              <div className="mx-auto flex flex-col items-center">
                {gameView.discard.length > 0 ? (
                  <CardFace
                    card={gameView.discard[gameView.discard.length - 1]!}
                    className="h-28 w-[4.6rem] sm:h-36 sm:w-24"
                    label={`Top discard card: ${getCardName(gameView.discard[gameView.discard.length - 1]!)}`}
                  />
                ) : (
                  <div
                    aria-label="Discard pile is empty"
                    className="flex h-28 w-[4.6rem] items-center justify-center rounded-xl border-2 border-dashed border-[#b8c5b2] text-xs font-bold text-[#647363] sm:h-36 sm:w-24"
                  >
                    Discard
                  </div>
                )}
                <span className="mt-1 text-[10px] font-black uppercase tracking-wide text-[#566553]">
                  Discard
                </span>
              </div>

              <div className="text-center">
                <div
                  aria-label={
                    actionWindow
                      ? `${secondsLeft} seconds remaining in the action window`
                      : `Waiting for ${nextName}`
                  }
                  aria-live="polite"
                  className="relative mx-auto flex size-16 items-center justify-center rounded-full sm:size-20"
                  role="timer"
                  style={{
                    background: actionWindow
                      ? `conic-gradient(#c64f32 ${ringProgress * 360}deg, #ded6c9 ${ringProgress * 360}deg)`
                      : "#ded6c9",
                  }}
                >
                  <span className="flex size-[3.35rem] items-center justify-center rounded-full bg-[#fffdf8] text-xl font-black tabular-nums sm:size-[4.25rem] sm:text-2xl">
                    {actionWindow ? secondsLeft : "—"}
                  </span>
                </div>
                <p className="mt-1.5 max-w-28 text-[10px] font-bold text-[#4c5b4e] sm:max-w-none sm:text-xs">
                  {actionWindow ? "Window countdown" : `Turn: ${nextName}`}
                </p>
              </div>

              <button
                aria-label={`Draw pile, ${gameView.deckCount} cards. Draw a card`}
                className="relative mx-auto flex h-28 w-[4.6rem] flex-col items-center justify-center rounded-xl border-2 border-[#fffdf8] bg-[#315840] text-center text-white shadow-lg transition hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#cf5939] disabled:cursor-not-allowed disabled:opacity-50 sm:h-36 sm:w-24"
                disabled={!turnIsYours || busy || !connected}
                onClick={() => void runAction("game:draw", {})}
                type="button"
              >
                <span className="absolute inset-0">
                  <CardBack decorative />
                </span>
                <span className="absolute bottom-1 z-10 rounded bg-[#000000] px-1.5 py-0.5 text-[9px] font-black text-white">
                  {gameView.deckCount} left
                </span>
              </button>
            </div>

            {gameView.activeAceRequest &&
              !pendingAceChoice &&
              isAceResponder &&
              aces.length > 0 && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button
                    className={counterButtonClass}
                    disabled={busy || !connected}
                    onClick={() => void playCounter("ace", [aces[0]!.id])}
                    type="button"
                  >
                    Answer with 1 Ace
                  </button>
                  {aces.length > 1 && (
                    <button
                      className={counterButtonClass}
                      disabled={busy || !connected}
                      onClick={() =>
                        void playCounter("ace", [aces[0]!.id, aces[1]!.id])
                      }
                      type="button"
                    >
                      Answer with 2 Aces
                    </button>
                  )}
                </div>
              )}

            {pendingAceChoice?.chooserId === playerId && (
              <div
                aria-label="Resolve the Ace request"
                className="mx-auto mt-4 max-w-xl rounded-2xl border border-[#d8c6e1] bg-[#fbf5ff] p-4 text-center"
                role="group"
              >
                <p className="text-sm font-extrabold">
                  Choose which part of your Ace request to keep.
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {pendingAceChoice.request.suit && (
                    <button
                      className={counterButtonClass}
                      disabled={busy || !connected}
                      onClick={() =>
                        void runAction("game:chooseAceRequest", {
                          forgo: "rank",
                        })
                      }
                      type="button"
                    >
                      Keep{" "}
                      {
                        suits.find(
                          (suit) =>
                            suit.value === pendingAceChoice.request.suit,
                        )?.label
                      }
                    </button>
                  )}
                  {pendingAceChoice.request.rank && (
                    <button
                      className={counterButtonClass}
                      disabled={busy || !connected}
                      onClick={() =>
                        void runAction("game:chooseAceRequest", {
                          forgo: "suit",
                        })
                      }
                      type="button"
                    >
                      Keep number {pendingAceChoice.request.rank}
                    </button>
                  )}
                </div>
              </div>
            )}

            {actionWindow &&
              gameView.pendingKingCounter?.playerId === playerId &&
              kings[0] && (
                <div className="mt-4 flex justify-center">
                  <button
                    className={counterButtonClass}
                    disabled={busy || !connected}
                    onClick={() => void playCounter("king", [kings[0]!.id])}
                    type="button"
                  >
                    Counter with King
                  </button>
                </div>
              )}
            {actionWindow &&
              gameView.pendingJackCounters?.playerId === playerId &&
              jacks[0] && (
                <div className="mt-4 flex justify-center">
                  <button
                    className={counterButtonClass}
                    disabled={busy || !connected}
                    onClick={() => void playCounter("jack", [jacks[0]!.id])}
                    type="button"
                  >
                    Refuse the skip with Jack
                  </button>
                </div>
              )}

            <div className="mt-5 flex flex-col items-center gap-2 border-t border-[#cfdbca] pt-4 sm:mt-6 sm:pt-5">
              <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-[#50634f]">
                Your hand · {hand.length} {hand.length === 1 ? "card" : "cards"}
              </p>
              <div
                aria-label="Your hand. Select one or more cards of the same rank."
                className="flex w-full touch-pan-x items-end overflow-x-auto px-1 pb-4 pt-4 sm:justify-center sm:overflow-visible"
                role="group"
                tabIndex={0}
              >
                {hand.map((card, index) => (
                  <div
                    className={`${index ? "-ml-4 sm:-ml-3" : ""} shrink-0`}
                    key={card.id}
                  >
                    <Card
                      card={card}
                      disabled={
                        (!turnIsYours && !selectedIds.includes(card.id)) ||
                        (selectedIds.length > 0 &&
                          handRank !== card.rank &&
                          !selectedIds.includes(card.id)) ||
                        (card.rank === "A" &&
                          selectedIds.length >= 2 &&
                          !selectedIds.includes(card.id))
                      }
                      className="sm:h-36 sm:w-24"
                      label={`${getCardName(card)}${selectedIds.includes(card.id) ? ", selected" : ""}`}
                      onClick={() => toggleCard(card.id)}
                      selected={selectedIds.includes(card.id)}
                    />
                  </div>
                ))}
              </div>
              {hand.length === 0 && (
                <p className="text-sm font-semibold text-[#657067]">
                  Your hand is empty. Wait for your turn to draw.
                </p>
              )}
              <div className="flex w-full flex-wrap justify-center gap-2 sm:w-auto">
                <button
                  className={primaryButtonClass}
                  disabled={
                    !turnIsYours ||
                    selectedIds.length === 0 ||
                    busy ||
                    !connected
                  }
                  onClick={() => void playSelected()}
                  type="button"
                >
                  Play
                  {selectedIds.length > 1 ? ` ${selectedIds.length} cards` : ""}
                </button>
                {actionWindow && nikosAvailable && (
                  <button
                    className="min-h-12 rounded-xl border-2 border-[#c64f32] bg-[#fff7f1] px-5 text-sm font-black text-[#a3422d] transition hover:bg-[#fbe8dd] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2822] disabled:opacity-50"
                    disabled={busy || !connected}
                    onClick={() => void runAction("game:nikoKadi", {})}
                    type="button"
                  >
                    Niko Kadi!
                  </button>
                )}
              </div>
              <p
                aria-live="polite"
                className="min-h-5 text-center text-xs font-semibold text-[#566553]"
              >
                {turnIsYours
                  ? "Your turn. Select a card or draw."
                  : actionWindow
                    ? `Everyone waits for the window. Next: ${nextName}.`
                    : `Waiting for ${nextName}.`}
              </p>
            </div>
          </div>
        </section>

        <ul aria-label="Your seat" className="mt-3 flex justify-center">
          {namedPlayers
            .filter((player) => player.id === playerId)
            .map((player) => (
              <PlayerSeat
                cardCount={player.cardCount}
                current={player.id === gameView.currentPlayerId}
                id={player.id}
                key={player.id}
                name={player.name}
                nikoKadiPressed={player.nikoKadiPressed}
                self
              />
            ))}
        </ul>

        {acePickerOpen && (
          <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#18221c]/50 p-3 sm:items-center">
            <section
              aria-labelledby="ace-picker-heading"
              aria-modal="true"
              className="w-full max-w-lg rounded-[1.75rem] bg-[#fffdf8] p-5 shadow-2xl sm:p-7"
              onKeyDown={(event) => {
                if (event.key === "Escape") setAcePickerOpen(false);
              }}
              role="dialog"
            >
              <h2 className="text-xl font-black" id="ace-picker-heading">
                {selectedAces.length === 2
                  ? "Choose a specific card"
                  : "Choose your Ace request"}
              </h2>
              <p className="mt-1 text-sm text-[#657067]">
                {selectedAces.length === 2
                  ? "Pick both the suit and number the next player must match."
                  : "Choose a suit or a number for the next player to match."}
              </p>
              <div className="mt-5">
                <p className="text-xs font-black uppercase tracking-wide text-[#657067]">
                  Suit
                </p>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {suits.map((suit) => (
                    <button
                      aria-pressed={aceChoice.suit === suit.value}
                      className={`min-h-11 rounded-xl border px-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-[#cf5939] ${
                        aceChoice.suit === suit.value
                          ? "border-[#c64f32] bg-[#f9e9df]"
                          : "border-[#ded5c8] bg-white"
                      }`}
                      key={suit.value}
                      onClick={() =>
                        setAceChoice((choice) =>
                          selectedAces.length === 1
                            ? { suit: suit.value }
                            : { ...choice, suit: suit.value },
                        )
                      }
                      type="button"
                    >
                      {suit.glyph} {suit.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <p className="text-xs font-black uppercase tracking-wide text-[#657067]">
                  Number
                </p>
                <div className="mt-2 grid grid-cols-5 gap-2">
                  {numberRanks.map((rank) => (
                    <button
                      aria-pressed={aceChoice.rank === rank}
                      className={`min-h-10 rounded-xl border text-sm font-bold focus-visible:outline-2 focus-visible:outline-[#cf5939] ${
                        aceChoice.rank === rank
                          ? "border-[#c64f32] bg-[#f9e9df]"
                          : "border-[#ded5c8] bg-white"
                      }`}
                      key={rank}
                      onClick={() =>
                        setAceChoice((choice) =>
                          selectedAces.length === 1
                            ? { rank }
                            : { ...choice, rank },
                        )
                      }
                      type="button"
                    >
                      {rank}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  className={secondaryButtonClass}
                  onClick={() => setAcePickerOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className={primaryButtonClass}
                  disabled={busy || !connected}
                  onClick={() => void submitAcePlay()}
                  type="button"
                >
                  Play Ace{selectedAces.length === 2 ? "s" : ""}
                </button>
              </div>
            </section>
          </div>
        )}

        {toast && <Toast message={toast} />}
      </div>
      <ChatPanel
        connected={connected}
        emit={emit}
        messages={chatMessages}
        muted={muted}
      />
    </main>
  );
}

function Toast({ message }: { message: string }) {
  return (
    <p
      className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,36rem)] -translate-x-1/2 rounded-2xl border border-[#f0c8bb] bg-[#fff1eb] px-4 py-3 text-center text-sm font-bold text-[#9e3f2b] shadow-xl"
      role="alert"
    >
      {message}
    </p>
  );
}

const primaryButtonClass =
  "kadi-sticker-button min-h-12 rounded-xl bg-[#c64f32] px-5 text-sm font-extrabold text-white shadow-md shadow-[#c64f32]/15 transition hover:bg-[#ae422a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2822] disabled:cursor-not-allowed disabled:bg-[#c9b9a8] disabled:shadow-none";
const secondaryButtonClass =
  "min-h-12 rounded-xl border border-[#d8d0c3] bg-[#fffdf8] px-5 text-sm font-extrabold text-[#33443a] hover:bg-[#f6f1e9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#cf5939]";
const counterButtonClass =
  "min-h-11 rounded-xl border border-[#b9c8b4] bg-[#fffdf8] px-4 text-sm font-extrabold text-[#315e40] hover:bg-[#eaf0e6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2822] disabled:opacity-50";
const menuButtonClass =
  "min-h-10 rounded-lg px-2 text-left text-sm font-bold hover:bg-[#f4eee4] focus-visible:outline-2 focus-visible:outline-[#cf5939] disabled:opacity-50";
const miniMenuButtonClass =
  "min-h-8 rounded-lg border border-[#ded5c8] px-2 text-[10px] font-bold hover:bg-[#f4eee4] focus-visible:outline-2 focus-visible:outline-[#cf5939] disabled:opacity-50";
