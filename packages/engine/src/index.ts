import { z } from "zod";

export const SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;
export type Suit = (typeof SUITS)[number];

export const NUMBERS = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export type NumberRank = (typeof NUMBERS)[number];

export type CardRank = NumberRank | "J" | "Q" | "K" | "A" | "JOKER";

export interface Card {
  id: string;
  suit: Suit | null;
  rank: CardRank;
}

export interface Player {
  id: string;
  hand: Card[];
  nikoKadiPressed: boolean;
}

export type Direction = 1 | -1;

export interface PendingPenalty {
  amount: 2 | 3 | 5;
  cardId: string;
}

export interface AceRequest {
  byPlayerId: string;
  suit?: Suit;
  rank?: NumberRank;
  remainingPlayers: number;
}

export interface PendingKingCounter {
  playerId: string;
  lastPlayerId: string;
}

export interface PendingJackCounters {
  playerId: string;
  lastPlayerId: string;
  remainingSkips: number;
}

export type WindowActionType = "play" | "draw" | "counter" | "ace-choice";
export type CounterKind = "king" | "jack" | "ace";

export interface GameWindow {
  openedAt: number;
  deadline: number;
  actorId: string;
  nextPlayerId: string;
  actionType: WindowActionType;
  counterKind: CounterKind | null;
}

export interface PendingAceChoice {
  chooserId: string;
  responderId: string;
  request: AceRequest;
}

export interface GameState {
  players: Player[];
  deck: Card[];
  discard: Card[];
  direction: Direction;
  currentPlayerIndex: number;
  pendingPenalty: PendingPenalty | null;
  activeAceRequest: AceRequest | null;
  pendingKingCounter: PendingKingCounter | null;
  pendingJackCounters: PendingJackCounters | null;
  window: GameWindow | null;
  nikoKadiFlags: Record<string, boolean>;
  pendingAceChoice: PendingAceChoice | null;
  winner: string | null;
  logicalTimeMs: number;
}

export interface AceRequestChoice {
  suit?: Suit;
  rank?: NumberRank;
}

export type GameAction =
  | { type: "play"; cardIds: string[]; aceRequest?: AceRequestChoice }
  | { type: "draw" }
  | { type: "counter"; kind: CounterKind; cardIds: string[] }
  | { type: "nikoKadi" }
  | { type: "chooseAceRequest"; forgo: "suit" | "rank" };

export interface ApplyActionOptions {
  /** Server-supplied monotonic timestamp in milliseconds. No clock is read here. */
  nowMs?: number;
  /** Injected randomness used only if a deck reshuffle is required. */
  rng?: () => number;
}

export type GameErrorCode =
  | "INVALID_ACTION"
  | "UNKNOWN_PLAYER"
  | "GAME_OVER"
  | "NOT_YOUR_TURN"
  | "WINDOW_OPEN"
  | "WINDOW_EXPIRED"
  | "NO_WINDOW"
  | "WINDOW_NOT_EXPIRED"
  | "WRONG_COUNTER"
  | "INVALID_CARDS"
  | "CARD_NOT_OWNED"
  | "ILLEGAL_PLAY"
  | "ACE_REQUEST_REQUIRED"
  | "ACE_REQUEST_INVALID"
  | "DRAW_NOT_ALLOWED"
  | "NIKO_KADI_NOT_ALLOWED"
  | "ACE_CHOICE_NOT_PENDING"
  | "ACE_CHOICE_INVALID"
  | "DECK_EXHAUSTED"
  | "RNG_REQUIRED"
  | "INVALID_TIME";

export interface GameError {
  code: GameErrorCode;
  message: string;
}

export type ActionResult =
  { ok: true; state: GameState } | { ok: false; error: GameError };

export interface PlayerView {
  id: string;
  hand: Card[] | null;
  cardCount: number;
  nikoKadiPressed: boolean;
}

export interface GameView {
  players: PlayerView[];
  deckCount: number;
  discard: Card[];
  direction: Direction;
  currentPlayerId: string;
  pendingPenalty: PendingPenalty | null;
  activeAceRequest: AceRequest | null;
  pendingKingCounter: PendingKingCounter | null;
  pendingJackCounters: PendingJackCounters | null;
  window: GameWindow | null;
  pendingAceChoice: PendingAceChoice | null;
  winner: string | null;
}

const suitSchema = z.enum(SUITS);
const aceRequestChoiceSchema = z
  .object({
    suit: suitSchema.optional(),
    rank: z
      .number()
      .int()
      .refine((rank) => NUMBERS.includes(rank as NumberRank))
      .optional(),
  })
  .strict();

const gameActionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("play"),
      cardIds: z.array(z.string().min(1)).min(1),
      aceRequest: aceRequestChoiceSchema.optional(),
    })
    .strict(),
  z.object({ type: z.literal("draw") }).strict(),
  z
    .object({
      type: z.literal("counter"),
      kind: z.enum(["king", "jack", "ace"]),
      cardIds: z.array(z.string().min(1)).min(1),
    })
    .strict(),
  z.object({ type: z.literal("nikoKadi") }).strict(),
  z
    .object({
      type: z.literal("chooseAceRequest"),
      forgo: z.enum(["suit", "rank"]),
    })
    .strict(),
]);
const playerIdsSchema = z.array(z.string().trim().min(1)).min(2).max(6);

const SUIT_RANKS: readonly Exclude<CardRank, "JOKER">[] = [
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  "J",
  "Q",
  "K",
  "A",
];

const STARTING_RANKS: readonly NumberRank[] = [4, 5, 6, 7, 9, 10];
const WINDOW_DURATION_MS = 5_000;

function fail(code: GameErrorCode, message: string): ActionResult {
  return { ok: false, error: { code, message } };
}

function createDeck(rng: () => number): Card[] {
  const prefix = Array.from({ length: 10 }, () => randomIndex(256, rng));
  prefix[6] = (prefix[6]! & 0x0f) | 0x40;
  prefix[8] = (prefix[8]! & 0x3f) | 0x80;
  let cardIndex = 0;
  const nextId = () => {
    const bytes = [...prefix, 0, 0, 0, 0, 0, cardIndex++];
    const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  };
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of SUIT_RANKS) {
      cards.push({ id: nextId(), suit, rank });
    }
  }
  cards.push(
    { id: nextId(), suit: null, rank: "JOKER" },
    { id: nextId(), suit: null, rank: "JOKER" },
  );
  return cards;
}

function randomIndex(length: number, rng: () => number): number {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError("RNG must return a finite number in [0, 1).");
  }
  return Math.floor(value * length);
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1, rng);
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex]!,
      shuffled[index]!,
    ];
  }
  return shuffled;
}

function nextIndex(state: GameState, fromIndex: number, steps = 1): number {
  const playerCount = state.players.length;
  const offset = state.direction * steps;
  return (((fromIndex + offset) % playerCount) + playerCount) % playerCount;
}

function playerIndex(state: GameState, playerId: string): number {
  return state.players.findIndex((player) => player.id === playerId);
}

function currentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex]!;
}

function topCard(state: GameState): Card {
  return state.discard[state.discard.length - 1]!;
}

function isSpecialEight(card: Card): boolean {
  return card.rank === 8 || card.rank === "Q";
}

function isPlainFinishingCard(card: Card): boolean {
  return STARTING_RANKS.includes(card.rank as NumberRank);
}

function penaltyAmount(card: Card): 2 | 3 | 5 | null {
  if (card.rank === 2) return 2;
  if (card.rank === 3) return 3;
  if (card.rank === "JOKER") return 5;
  return null;
}

function cardMatchesTop(card: Card, top: Card): boolean {
  if (card.rank === "JOKER" || card.rank === "A") return true;
  return (
    card.rank === top.rank || (card.suit !== null && card.suit === top.suit)
  );
}

function matchesRequest(card: Card, request: AceRequest): boolean {
  return (
    (request.suit === undefined || card.suit === request.suit) &&
    (request.rank === undefined || card.rank === request.rank)
  );
}

function normalizeAceChoice(
  choice: AceRequestChoice | undefined,
  aceCount: number,
  againstPenalty: boolean,
): AceRequestChoice | null {
  if (choice === undefined) return null;
  const hasSuit = choice.suit !== undefined;
  const hasRank = choice.rank !== undefined;
  if (!hasSuit && !hasRank) return null;
  // TODO(assumption): even two Aces cancelling a penalty request only one
  // suit-or-number choice, following the specific penalty-Ace rule.
  if (againstPenalty || aceCount === 1) {
    if (hasSuit === hasRank) return null;
    return choice;
  }
  if (!hasSuit || !hasRank) return null;
  return choice;
}

function makeRequest(
  playerId: string,
  choice: AceRequestChoice,
  playerCount: number,
): AceRequest {
  return {
    byPlayerId: playerId,
    ...(choice.suit === undefined ? {} : { suit: choice.suit }),
    ...(choice.rank === undefined ? {} : { rank: choice.rank }),
    remainingPlayers: playerCount - 1,
  };
}

function sameRank(cards: Card[]): boolean {
  return cards.every((card) => card.rank === cards[0]!.rank);
}

function canAnswerPenalty(state: GameState, cards: Card[]): boolean {
  const pending = state.pendingPenalty;
  if (!pending) return true;
  const source = state.discard.find((card) => card.id === pending.cardId);
  if (!source) return false;
  return cards.every((card) => {
    if (card.rank === "JOKER") return true;
    if (card.rank === 2) {
      return (
        pending.amount === 2 ||
        (pending.amount === 3 && card.suit === source.suit)
      );
    }
    if (card.rank === 3) {
      return (
        pending.amount === 3 ||
        (pending.amount === 2 && card.suit === source.suit)
      );
    }
    return false;
  });
}

function validatePlayCards(
  state: GameState,
  cards: Card[],
  aceRequestChoice?: AceRequestChoice,
):
  | { valid: true; newAceRequest: AceRequest | null; clearsRequest: boolean }
  | {
      valid: false;
      error: GameError;
    } {
  if (cards.length === 0 || (!isSpecialEight(cards[0]!) && !sameRank(cards))) {
    return {
      valid: false,
      error: {
        code: "ILLEGAL_PLAY",
        message: "Cards must share a rank, except for a valid Q/8 chain.",
      },
    };
  }

  const aceCount = cards.filter((card) => card.rank === "A").length;
  if (aceCount > 2) {
    return {
      valid: false,
      error: {
        code: "ILLEGAL_PLAY",
        message: "A player may play at most two Aces in one play.",
      },
    };
  }
  if (aceCount > 0 && cards.every((card) => card.rank === "A")) {
    if (state.activeAceRequest) {
      return {
        valid: false,
        error: {
          code: "ILLEGAL_PLAY",
          message: "Use an Ace counter to cancel an active Ace request.",
        },
      };
    }
    const choice = normalizeAceChoice(
      aceRequestChoice,
      aceCount,
      state.pendingPenalty !== null,
    );
    if (!choice) {
      return {
        valid: false,
        error: {
          code: aceRequestChoice
            ? "ACE_REQUEST_INVALID"
            : "ACE_REQUEST_REQUIRED",
          message:
            state.pendingPenalty || aceCount === 1
              ? "One Ace must request either a suit or a number."
              : "Two Aces must request a specific suit and number.",
        },
      };
    }
    return {
      valid: true,
      newAceRequest: makeRequest(
        currentPlayer(state).id,
        choice,
        state.players.length,
      ),
      clearsRequest: true,
    };
  }
  if (aceCount > 0 && !isSpecialEight(cards[0]!)) {
    return {
      valid: false,
      error: {
        code: "ILLEGAL_PLAY",
        message: "Aces cannot be mixed with other card ranks.",
      },
    };
  }

  if (aceRequestChoice !== undefined) {
    return {
      valid: false,
      error: {
        code: "ACE_REQUEST_INVALID",
        message: "Ace request choices require an Ace play.",
      },
    };
  }

  if (state.pendingPenalty) {
    if (!canAnswerPenalty(state, cards)) {
      return {
        valid: false,
        error: {
          code: "ILLEGAL_PLAY",
          message: "Only an allowed penalty card can answer.",
        },
      };
    }
    return { valid: true, newAceRequest: null, clearsRequest: true };
  }

  const top = topCard(state);
  const first = cards[0]!;

  if (
    state.activeAceRequest &&
    !matchesRequest(first, state.activeAceRequest)
  ) {
    return {
      valid: false,
      error: {
        code: "ILLEGAL_PLAY",
        message: "The first card must match the active Ace request.",
      },
    };
  }
  // TODO(assumption): normal card matching is still required after an Ace
  // request; only the Ace counter itself bypasses the top-card match.

  if (isSpecialEight(first)) {
    if (first.suit === null || first.suit !== top.suit) {
      return {
        valid: false,
        error: {
          code: "ILLEGAL_PLAY",
          message: "A Q or 8 must match the top card's suit.",
        },
      };
    }
    let chainEnd = 0;
    while (chainEnd < cards.length && isSpecialEight(cards[chainEnd]!)) {
      const card = cards[chainEnd]!;
      if (chainEnd > 0) {
        const previous = cards[chainEnd - 1]!;
        if (card.suit !== previous.suit && card.rank !== previous.rank) {
          return {
            valid: false,
            error: {
              code: "ILLEGAL_PLAY",
              message: "Consecutive Q/8 cards must match suit or rank.",
            },
          };
        }
      }
      chainEnd += 1;
    }
    const lastSpecial = cards[chainEnd - 1]!;
    const companion = cards[chainEnd];
    if (!companion || companion.suit !== lastSpecial.suit) {
      return {
        valid: false,
        error: {
          code: "ILLEGAL_PLAY",
          message: "A Q/8 chain needs a same-suit accompanying card.",
        },
      };
    }
    // TODO(assumption from RULES.md): the Q/8 companion may be any card of the
    // required suit; an Ace companion does not create a second Ace request.
    if (
      cards.slice(chainEnd + 1).some((card) => card.rank !== companion.rank)
    ) {
      return {
        valid: false,
        error: {
          code: "ILLEGAL_PLAY",
          message: "Cards after the companion must share its rank.",
        },
      };
    }
  } else {
    if (!cardMatchesTop(first, top)) {
      return {
        valid: false,
        error: {
          code: "ILLEGAL_PLAY",
          message: "The first card must match the top card by suit or rank.",
        },
      };
    }
    if (cards.some((card) => card.rank !== first.rank)) {
      return {
        valid: false,
        error: {
          code: "ILLEGAL_PLAY",
          message: "Cards in one play must share a rank.",
        },
      };
    }
  }

  return { valid: true, newAceRequest: null, clearsRequest: true };
}

function openWindow(
  state: GameState,
  actorId: string,
  nextPlayerIndex: number,
  actionType: WindowActionType,
  counterKind: CounterKind | null,
  nowMs: number,
): GameWindow {
  return {
    openedAt: nowMs,
    deadline: nowMs + WINDOW_DURATION_MS,
    actorId,
    nextPlayerId: state.players[nextPlayerIndex]!.id,
    actionType,
    counterKind,
  };
}

function copyState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      hand: player.hand.map((card) => ({ ...card })),
    })),
    deck: state.deck.map((card) => ({ ...card })),
    discard: state.discard.map((card) => ({ ...card })),
    pendingPenalty: state.pendingPenalty ? { ...state.pendingPenalty } : null,
    activeAceRequest: state.activeAceRequest
      ? { ...state.activeAceRequest }
      : null,
    pendingKingCounter: state.pendingKingCounter
      ? { ...state.pendingKingCounter }
      : null,
    pendingJackCounters: state.pendingJackCounters
      ? { ...state.pendingJackCounters }
      : null,
    window: state.window ? { ...state.window } : null,
    nikoKadiFlags: { ...state.nikoKadiFlags },
    pendingAceChoice: state.pendingAceChoice
      ? {
          ...state.pendingAceChoice,
          request: { ...state.pendingAceChoice.request },
        }
      : null,
  };
}

function generateOrderedSubsets(cards: Card[]): Card[][] {
  const results: Card[][] = [];
  const visit = (remaining: Card[], chosen: Card[]) => {
    if (chosen.length > 0) results.push(chosen);
    for (let index = 0; index < remaining.length; index += 1) {
      const card = remaining[index]!;
      visit(
        [...remaining.slice(0, index), ...remaining.slice(index + 1)],
        [...chosen, card],
      );
    }
  };
  visit(cards, []);
  return results;
}

function generateQ8Plays(hand: Card[]): Card[][] {
  const specials = hand.filter(isSpecialEight);
  const companions = hand.filter((card) => !isSpecialEight(card));
  const results: Card[][] = [];

  for (const first of specials) {
    const extend = (chain: Card[], remaining: Card[]) => {
      const last = chain[chain.length - 1]!;
      for (const companion of companions) {
        if (
          companion.suit !== last.suit ||
          chain.some((card) => card.id === companion.id)
        ) {
          continue;
        }
        const suffixCards = hand.filter(
          (card) =>
            card.id !== companion.id &&
            !chain.some((chainCard) => chainCard.id === card.id) &&
            card.rank === companion.rank,
        );
        const suffixes = generateOrderedSubsets(suffixCards);
        if (suffixes.length === 0) {
          results.push([...chain, companion]);
        } else {
          for (const suffix of suffixes)
            results.push([...chain, companion, ...suffix]);
          results.push([...chain, companion]);
        }
      }

      for (let index = 0; index < remaining.length; index += 1) {
        const next = remaining[index]!;
        if (next.suit !== last.suit && next.rank !== last.rank) continue;
        extend(
          [...chain, next],
          [...remaining.slice(0, index), ...remaining.slice(index + 1)],
        );
      }
    };

    extend(
      [first],
      specials.filter((card) => card.id !== first.id),
    );
  }
  return results;
}

function candidatePlays(hand: Card[]): Card[][] {
  const byRank = new Map<CardRank, Card[]>();
  for (const card of hand) {
    if (isSpecialEight(card)) continue;
    const group = byRank.get(card.rank) ?? [];
    group.push(card);
    byRank.set(card.rank, group);
  }
  const plays = [...byRank.values()].flatMap(generateOrderedSubsets);
  plays.push(...generateQ8Plays(hand));
  return plays;
}

function aceChoices(
  aceCount: number,
  againstPenalty: boolean,
): AceRequestChoice[] {
  if (aceCount === 1 || againstPenalty) {
    return [
      ...SUITS.map((suit) => ({ suit })),
      ...NUMBERS.map((rank) => ({ rank })),
    ];
  }
  return SUITS.flatMap((suit) => NUMBERS.map((rank) => ({ suit, rank })));
}

function actionKey(action: GameAction): string {
  return JSON.stringify(action);
}

function validActionsForHand(state: GameState, player: Player): GameAction[] {
  const actions: GameAction[] = [];
  const seen = new Set<string>();

  for (const cards of candidatePlays(player.hand)) {
    const aceCount = cards.filter((card) => card.rank === "A").length;
    const choices =
      aceCount > 0
        ? aceChoices(aceCount, state.pendingPenalty !== null)
        : [undefined];
    for (const choice of choices) {
      const result = validatePlayCards(state, cards, choice);
      if (!result.valid) continue;
      const action: GameAction = {
        type: "play",
        cardIds: cards.map((card) => card.id),
        ...(choice === undefined ? {} : { aceRequest: choice }),
      };
      const key = actionKey(action);
      if (!seen.has(key)) {
        seen.add(key);
        actions.push(action);
      }
    }
  }
  return actions;
}

function isWinningPlay(
  state: GameState,
  player: Player,
  action: GameAction,
): boolean {
  if (action.type !== "play" || !player.nikoKadiPressed) return false;
  if (state.players.some((other) => other.hand.length < 1)) return false;
  const cards = action.cardIds.map((id) =>
    player.hand.find((card) => card.id === id),
  );
  if (cards.some((card) => !card)) return false;
  const playedCards = cards as Card[];
  return (
    playedCards.length === player.hand.length &&
    isPlainFinishingCard(playedCards[playedCards.length - 1]!)
  );
}

function canWinNow(state: GameState, player: Player): boolean {
  return validActionsForHand(state, player).some((action) =>
    isWinningPlay(state, player, action),
  );
}

function drawCards(
  state: GameState,
  count: number,
  rng?: () => number,
): { deck: Card[]; discard: Card[]; drawn: Card[] } | GameError {
  let deck = state.deck.map((card) => ({ ...card }));
  let discard = state.discard.map((card) => ({ ...card }));
  const drawn: Card[] = [];

  while (drawn.length < count) {
    if (deck.length === 0) {
      if (discard.length <= 1) {
        return {
          code: "DECK_EXHAUSTED",
          message: "No cards remain to draw.",
        };
      }
      if (!rng) {
        return {
          code: "RNG_REQUIRED",
          message: "Provide an RNG when the discard pile must be reshuffled.",
        };
      }
      const top = discard[discard.length - 1]!;
      deck = shuffle(discard.slice(0, -1), rng);
      discard = [top];
    }
    drawn.push(deck.shift()!);
  }
  return { deck, discard, drawn };
}

function requestAfterUnmatchedTurn(
  request: AceRequest | null,
  playerId: string,
): AceRequest | null {
  if (!request || request.byPlayerId === playerId) return request;
  const remainingPlayers = request.remainingPlayers - 1;
  return remainingPlayers <= 0 ? null : { ...request, remainingPlayers };
}

function actionTimestamp(
  state: GameState,
  options: ApplyActionOptions,
): number | null {
  const value = options.nowMs ?? state.logicalTimeMs;
  return Number.isFinite(value) && value >= state.logicalTimeMs ? value : null;
}

function getCounterActions(state: GameState, player: Player): GameAction[] {
  const actions: GameAction[] = [];
  if (
    state.pendingKingCounter?.playerId === player.id &&
    player.hand.some((card) => card.rank === "K")
  ) {
    for (const card of player.hand.filter((item) => item.rank === "K")) {
      actions.push({ type: "counter", kind: "king", cardIds: [card.id] });
    }
  }
  if (
    state.pendingJackCounters?.playerId === player.id &&
    player.hand.some((card) => card.rank === "J")
  ) {
    for (const card of player.hand.filter((item) => item.rank === "J")) {
      actions.push({ type: "counter", kind: "jack", cardIds: [card.id] });
    }
  }
  if (
    state.activeAceRequest &&
    state.activeAceRequest.byPlayerId !== player.id &&
    player.hand.some((card) => card.rank === "A")
  ) {
    for (const card of player.hand.filter((item) => item.rank === "A")) {
      actions.push({ type: "counter", kind: "ace", cardIds: [card.id] });
    }
    for (const cards of generateOrderedSubsets(
      player.hand.filter((card) => card.rank === "A"),
    ).filter((group) => group.length === 2)) {
      actions.push({
        type: "counter",
        kind: "ace",
        cardIds: cards.map((card) => card.id),
      });
    }
  }
  return actions;
}

export function createGame(playerIds: string[], rng: () => number): GameState {
  const parsedPlayerIds = playerIdsSchema.safeParse(playerIds);
  if (!parsedPlayerIds.success) {
    throw new RangeError("Kadi requires between 2 and 6 non-empty player IDs.");
  }
  const ids = parsedPlayerIds.data;
  if (new Set(ids).size !== ids.length) {
    throw new RangeError("Player IDs must be unique.");
  }

  const cards = createDeck(rng);
  const startingCards = cards.filter((card) =>
    STARTING_RANKS.includes(card.rank as NumberRank),
  );
  const startingCard = startingCards[randomIndex(startingCards.length, rng)]!;
  const deck = shuffle(
    cards.filter((card) => card.id !== startingCard.id),
    rng,
  );
  const players: Player[] = ids.map((id) => ({
    id,
    hand: [],
    nikoKadiPressed: false,
  }));
  for (let cardIndex = 0; cardIndex < 4; cardIndex += 1) {
    for (const player of players) player.hand.push(deck.shift()!);
  }

  const nikoKadiFlags = Object.fromEntries(ids.map((id) => [id, false]));

  return {
    players,
    deck,
    discard: [startingCard],
    direction: 1,
    currentPlayerIndex: 0,
    pendingPenalty: null,
    activeAceRequest: null,
    pendingKingCounter: null,
    pendingJackCounters: null,
    window: null,
    nikoKadiFlags,
    pendingAceChoice: null,
    winner: null,
    logicalTimeMs: 0,
  };
}

export function applyAction(
  state: GameState,
  playerId: string,
  action: GameAction,
  options: ApplyActionOptions = {},
): ActionResult {
  const parsedAction = gameActionSchema.safeParse(action);
  if (!parsedAction.success) {
    return fail(
      "INVALID_ACTION",
      "Action payload is invalid or contains unknown fields.",
    );
  }
  const validatedAction = parsedAction.data as GameAction;
  const index = playerIndex(state, playerId);
  if (index < 0) return fail("UNKNOWN_PLAYER", "Player is not in this game.");
  if (state.winner) return fail("GAME_OVER", "The game has already been won.");
  const nowMs = actionTimestamp(state, options);
  if (nowMs === null)
    return fail("INVALID_TIME", "Action time must be finite and monotonic.");
  if (state.window && nowMs >= state.window.deadline) {
    return fail(
      "WINDOW_EXPIRED",
      "The action window has expired; close it before acting.",
    );
  }

  if (validatedAction.type === "chooseAceRequest") {
    const pendingChoice = state.pendingAceChoice;
    if (!pendingChoice || pendingChoice.chooserId !== playerId) {
      return fail(
        "ACE_CHOICE_NOT_PENDING",
        "This player has no pending Ace request choice.",
      );
    }
    if (
      (validatedAction.forgo === "suit" &&
        pendingChoice.request.suit === undefined) ||
      (validatedAction.forgo === "rank" &&
        pendingChoice.request.rank === undefined)
    ) {
      return fail(
        "ACE_CHOICE_INVALID",
        "The selected part is not present in the Ace request.",
      );
    }
    const updated = copyState(state);
    const remaining = pendingChoice.request.remainingPlayers;
    if (remaining > 0) {
      const request: AceRequest = {
        ...pendingChoice.request,
        ...(validatedAction.forgo === "suit"
          ? { suit: undefined }
          : { rank: undefined }),
      };
      delete request.suit;
      delete request.rank;
      if (
        validatedAction.forgo === "suit" &&
        pendingChoice.request.rank !== undefined
      ) {
        request.rank = pendingChoice.request.rank;
      }
      if (
        validatedAction.forgo === "rank" &&
        pendingChoice.request.suit !== undefined
      ) {
        request.suit = pendingChoice.request.suit;
      }
      updated.activeAceRequest = request;
    } else {
      updated.activeAceRequest = null;
    }
    updated.pendingAceChoice = null;
    const next = playerIndex(updated, pendingChoice.responderId);
    const nextPlayerIndex = nextIndex(updated, next);
    updated.currentPlayerIndex = nextPlayerIndex;
    updated.logicalTimeMs = nowMs;
    updated.window = openWindow(
      updated,
      playerId,
      nextPlayerIndex,
      "ace-choice",
      updated.activeAceRequest ? "ace" : null,
      nowMs,
    );
    return { ok: true, state: updated };
  }

  if (validatedAction.type === "nikoKadi") {
    if (!state.window || state.window.actorId !== playerId) {
      return fail(
        "NIKO_KADI_NOT_ALLOWED",
        "Niko Kadi can only be pressed in the player's action window.",
      );
    }
    if (
      state.window.actionType !== "play" &&
      state.window.actionType !== "counter"
    ) {
      return fail(
        "NIKO_KADI_NOT_ALLOWED",
        "Niko Kadi is only available after playing cards.",
      );
    }
    if (state.players.some((player) => player.hand.length < 1)) {
      return fail(
        "NIKO_KADI_NOT_ALLOWED",
        "Every player must have at least one card.",
      );
    }
    if (state.nikoKadiFlags[playerId]) {
      return fail(
        "NIKO_KADI_NOT_ALLOWED",
        "Niko Kadi has already been pressed.",
      );
    }
    const updated = copyState(state);
    updated.players[index]!.nikoKadiPressed = true;
    updated.nikoKadiFlags[playerId] = true;
    updated.logicalTimeMs = nowMs;
    return { ok: true, state: updated };
  }

  if (validatedAction.type === "counter") {
    if (
      validatedAction.cardIds.length !== 1 &&
      validatedAction.kind !== "ace"
    ) {
      return fail(
        "INVALID_CARDS",
        "King and Jack counters use exactly one card.",
      );
    }
    if (
      validatedAction.cardIds.length < 1 ||
      validatedAction.cardIds.length > 2 ||
      new Set(validatedAction.cardIds).size !== validatedAction.cardIds.length
    ) {
      return fail(
        "INVALID_CARDS",
        "A counter must use one card, or at most two Aces.",
      );
    }
    const player = state.players[index]!;
    const cards = validatedAction.cardIds.map((id) =>
      player.hand.find((card) => card.id === id),
    );
    if (cards.some((card) => !card))
      return fail(
        "CARD_NOT_OWNED",
        "A counter card is not in the player's hand.",
      );
    const counterCards = cards as Card[];
    if (validatedAction.kind === "king") {
      if (
        state.pendingKingCounter?.playerId !== playerId ||
        counterCards.length !== 1 ||
        counterCards[0]!.rank !== "K" ||
        !state.window
      ) {
        return fail(
          "WRONG_COUNTER",
          "A King counter is not pending for this player.",
        );
      }
    } else if (validatedAction.kind === "jack") {
      if (
        state.pendingJackCounters?.playerId !== playerId ||
        counterCards.length !== 1 ||
        counterCards[0]!.rank !== "J" ||
        !state.window
      ) {
        return fail(
          "WRONG_COUNTER",
          "A Jack counter is not pending for this player.",
        );
      }
    } else if (
      !state.activeAceRequest ||
      state.activeAceRequest.byPlayerId === playerId ||
      counterCards.some((card) => card.rank !== "A")
    ) {
      return fail(
        "WRONG_COUNTER",
        "An Ace counter is not available to this player.",
      );
    } else if (state.window && state.window.nextPlayerId !== playerId) {
      return fail(
        "WRONG_COUNTER",
        "The Ace request is not open to this player.",
      );
    } else if (
      !state.window &&
      state.players[state.currentPlayerIndex]!.id !== playerId
    ) {
      return fail(
        "NOT_YOUR_TURN",
        "Only the player whose turn it is can answer with an Ace.",
      );
    }

    if (
      validatedAction.kind === "ace" &&
      counterCards.length === 2 &&
      new Set(counterCards.map((card) => card.id)).size !== 2
    ) {
      return fail("INVALID_CARDS", "Two distinct Aces are required.");
    }

    const updated = copyState(state);
    const updatedPlayer = updated.players[index]!;
    updatedPlayer.hand = updatedPlayer.hand.filter(
      (card) => !validatedAction.cardIds.includes(card.id),
    );
    updated.discard.push(...counterCards.map((card) => ({ ...card })));
    updated.logicalTimeMs = nowMs;

    if (validatedAction.kind === "king") {
      updated.direction = updated.direction === 1 ? -1 : 1;
      const next = nextIndex(updated, index);
      updated.pendingKingCounter = {
        playerId: updated.players[next]!.id,
        lastPlayerId: playerId,
      };
      updated.currentPlayerIndex = next;
      updated.window = openWindow(
        updated,
        playerId,
        next,
        "counter",
        "king",
        nowMs,
      );
      return { ok: true, state: updated };
    }

    if (validatedAction.kind === "jack") {
      const pending = updated.pendingJackCounters!;
      const next = nextIndex(updated, index);
      // TODO(assumption from RULES.md): each skipped player may counter in
      // sequence; a counter passes the outstanding skip to the next seat.
      updated.pendingJackCounters = {
        ...pending,
        playerId: updated.players[next]!.id,
        lastPlayerId: playerId,
      };
      updated.currentPlayerIndex = next;
      updated.window = openWindow(
        updated,
        playerId,
        next,
        "counter",
        "jack",
        nowMs,
      );
      return { ok: true, state: updated };
    }

    const request = state.activeAceRequest!;
    // TODO(assumption from RULES.md): the original player chooses which part
    // of a two-part Ace request to forgo after a single-Ace response.
    if (
      request.suit !== undefined &&
      request.rank !== undefined &&
      counterCards.length === 1
    ) {
      const decremented = {
        ...request,
        remainingPlayers: request.remainingPlayers - 1,
      };
      updated.activeAceRequest = request;
      updated.pendingAceChoice = {
        chooserId: request.byPlayerId,
        responderId: playerId,
        request: decremented,
      };
      const chooserIndex = playerIndex(updated, request.byPlayerId);
      updated.currentPlayerIndex = chooserIndex;
      updated.window = openWindow(
        updated,
        playerId,
        chooserIndex,
        "counter",
        null,
        nowMs,
      );
      return { ok: true, state: updated };
    }

    const next = nextIndex(updated, index);
    if (counterCards.length === 2) {
      const lastAce = counterCards[counterCards.length - 1]!;
      updated.activeAceRequest = makeRequest(
        playerId,
        { suit: lastAce.suit! },
        updated.players.length,
      );
    } else {
      const cancellingAce = counterCards[0]!;
      updated.activeAceRequest = makeRequest(
        playerId,
        { suit: cancellingAce.suit! },
        updated.players.length,
      );
    }
    updated.currentPlayerIndex = next;
    updated.window = openWindow(
      updated,
      playerId,
      next,
      "counter",
      "ace",
      nowMs,
    );
    return { ok: true, state: updated };
  }

  if (state.pendingAceChoice) {
    return fail(
      "ACE_CHOICE_NOT_PENDING",
      "The pending Ace request must be resolved first.",
    );
  }

  if (state.window)
    return fail(
      "WINDOW_OPEN",
      "Wait for the current five-second window to close.",
    );
  if (state.players[state.currentPlayerIndex]!.id !== playerId) {
    return fail("NOT_YOUR_TURN", "It is not this player's turn.");
  }

  const player = state.players[index]!;
  if (validatedAction.type === "draw") {
    const forcedByPenalty = state.pendingPenalty !== null;
    const drawCount = forcedByPenalty ? state.pendingPenalty!.amount : 1;
    const drawn = drawCards(state, drawCount, options.rng);
    if ("code" in drawn) return { ok: false, error: drawn };
    const updated = copyState(state);
    const updatedPlayer = updated.players[index]!;
    updated.deck = drawn.deck;
    updated.discard = drawn.discard;
    updatedPlayer.hand.push(...drawn.drawn);
    updatedPlayer.nikoKadiPressed = false;
    updated.nikoKadiFlags[playerId] = false;
    updated.pendingPenalty = null;
    updated.activeAceRequest = requestAfterUnmatchedTurn(
      updated.activeAceRequest,
      playerId,
    );
    const next = nextIndex(updated, index);
    updated.currentPlayerIndex = next;
    updated.logicalTimeMs = nowMs;
    updated.window = openWindow(updated, playerId, next, "draw", null, nowMs);
    return { ok: true, state: updated };
  }

  if (validatedAction.type !== "play") {
    return fail("INVALID_ACTION", "This action is not valid during a turn.");
  }
  if (
    validatedAction.cardIds.length === 0 ||
    new Set(validatedAction.cardIds).size !== validatedAction.cardIds.length
  ) {
    return fail("INVALID_CARDS", "A play needs distinct card IDs.");
  }
  const cards = validatedAction.cardIds.map((id) =>
    player.hand.find((card) => card.id === id),
  );
  if (cards.some((card) => !card)) {
    return fail("CARD_NOT_OWNED", "A played card is not in the player's hand.");
  }
  const playedCards = cards as Card[];
  const legality = validatePlayCards(
    state,
    playedCards,
    validatedAction.aceRequest,
  );
  if (!legality.valid) return { ok: false, error: legality.error };

  if (player.nikoKadiPressed && !canWinNow(state, player)) {
    return fail(
      "ILLEGAL_PLAY",
      "A player who cannot finish after calling Niko Kadi must draw a penalty card.",
    );
  }

  const updated = copyState(state);
  const updatedPlayer = updated.players[index]!;
  const hadCardsBeforePlay = updated.players.every(
    (item) => item.hand.length > 0,
  );
  updatedPlayer.hand = updatedPlayer.hand.filter(
    (card) => !validatedAction.cardIds.includes(card.id),
  );
  updated.discard.push(...playedCards.map((card) => ({ ...card })));
  updated.pendingPenalty = null;
  updated.pendingKingCounter = null;
  updated.pendingJackCounters = null;
  updated.activeAceRequest = legality.newAceRequest;
  // TODO(assumption): a Niko Kadi call persists through non-winning plays;
  // the rules explicitly cancel it on a pickup, not on another play.

  const lastPlayed = playedCards[playedCards.length - 1]!;
  const wins =
    updatedPlayer.hand.length === 0 &&
    isPlainFinishingCard(lastPlayed) &&
    hadCardsBeforePlay &&
    player.nikoKadiPressed &&
    !legality.newAceRequest;
  if (wins) {
    updated.winner = playerId;
    updated.nikoKadiFlags[playerId] = false;
    updatedPlayer.nikoKadiPressed = false;
    updated.window = null;
    updated.logicalTimeMs = nowMs;
    return { ok: true, state: updated };
  }

  if (state.activeAceRequest) {
    updated.activeAceRequest = null;
  }

  const kingCount = playedCards.filter((card) => card.rank === "K").length;
  const jackCount = playedCards.filter((card) => card.rank === "J").length;
  const lastCardPenalty = penaltyAmount(lastPlayed);
  if (lastCardPenalty !== null) {
    updated.pendingPenalty = { amount: lastCardPenalty, cardId: lastPlayed.id };
  }

  let next = nextIndex(updated, index);
  let counterKind: CounterKind | null = null;

  if (kingCount % 2 === 1) {
    updated.direction = updated.direction === 1 ? -1 : 1;
    next = nextIndex(updated, index);
    updated.pendingKingCounter = {
      playerId: updated.players[next]!.id,
      lastPlayerId: playerId,
    };
    counterKind = "king";
  }

  if (jackCount > 0) {
    next = nextIndex(updated, index);
    updated.pendingJackCounters = {
      playerId: updated.players[next]!.id,
      lastPlayerId: playerId,
      remainingSkips: jackCount,
    };
    counterKind = "jack";
  }

  if (legality.newAceRequest) {
    next = nextIndex(updated, index);
    counterKind = "ace";
  }

  updated.currentPlayerIndex = next;
  updated.logicalTimeMs = nowMs;
  updated.window = openWindow(
    updated,
    playerId,
    next,
    "play",
    counterKind,
    nowMs,
  );
  return { ok: true, state: updated };
}

export function getLegalMoves(
  state: GameState,
  playerId: string,
): GameAction[] {
  const index = playerIndex(state, playerId);
  if (index < 0 || state.winner) return [];
  const player = state.players[index]!;

  if (state.pendingAceChoice) {
    if (state.pendingAceChoice.chooserId !== playerId) return [];
    const canForgoSuit = state.pendingAceChoice.request.suit !== undefined;
    const canForgoRank = state.pendingAceChoice.request.rank !== undefined;
    return [
      ...(canForgoSuit
        ? [{ type: "chooseAceRequest", forgo: "suit" } as const]
        : []),
      ...(canForgoRank
        ? [{ type: "chooseAceRequest", forgo: "rank" } as const]
        : []),
    ];
  }

  if (state.window) {
    const moves: GameAction[] =
      state.window.actorId === playerId &&
      (state.window.actionType === "play" ||
        state.window.actionType === "counter") &&
      state.players.every((item) => item.hand.length > 0) &&
      !player.nikoKadiPressed
        ? [{ type: "nikoKadi" }]
        : [];
    if (state.window.nextPlayerId === playerId) {
      moves.push(...getCounterActions(state, player));
    }
    return moves;
  }

  if (state.players[state.currentPlayerIndex]!.id !== playerId) return [];

  if (player.nikoKadiPressed && !canWinNow(state, player)) {
    return [{ type: "draw" }];
  }

  const plays = validActionsForHand(state, player);
  const aceCounters = state.activeAceRequest
    ? getCounterActions(state, player).filter(
        (action) => action.type === "counter" && action.kind === "ace",
      )
    : [];
  return [...plays, ...aceCounters, { type: "draw" }];
}

export function closeWindowByDeadline(
  state: GameState,
  nowMs: number,
): ActionResult {
  if (!state.window)
    return fail("NO_WINDOW", "There is no open action window.");
  if (!Number.isFinite(nowMs) || nowMs < state.window.deadline) {
    return fail(
      "WINDOW_NOT_EXPIRED",
      "The five-second window has not expired.",
    );
  }

  const updated = copyState(state);
  updated.logicalTimeMs = nowMs;

  if (updated.pendingAceChoice) {
    updated.currentPlayerIndex = playerIndex(
      updated,
      updated.pendingAceChoice.chooserId,
    );
    updated.window = null;
    return { ok: true, state: updated };
  }

  if (updated.pendingKingCounter) {
    updated.currentPlayerIndex = playerIndex(
      updated,
      updated.players.length === 2
        ? updated.pendingKingCounter.lastPlayerId
        : updated.pendingKingCounter.playerId,
    );
    updated.pendingKingCounter = null;
    updated.window = null;
    return { ok: true, state: updated };
  }

  if (updated.pendingJackCounters) {
    const pending = updated.pendingJackCounters;
    const skippedIndex = playerIndex(updated, pending.playerId);
    const remainingSkips = pending.remainingSkips - 1;
    if (remainingSkips > 0) {
      const nextTarget = nextIndex(updated, skippedIndex);
      updated.pendingJackCounters = {
        ...pending,
        playerId: updated.players[nextTarget]!.id,
        remainingSkips,
      };
      updated.currentPlayerIndex = nextTarget;
      updated.window = openWindow(
        updated,
        pending.lastPlayerId,
        nextTarget,
        "counter",
        "jack",
        nowMs,
      );
      return { ok: true, state: updated };
    }

    const next =
      updated.players.length === 2
        ? playerIndex(updated, pending.lastPlayerId)
        : nextIndex(updated, skippedIndex);
    updated.currentPlayerIndex = next;
    updated.pendingJackCounters = null;
    updated.window = null;
    return { ok: true, state: updated };
  }

  updated.currentPlayerIndex = playerIndex(updated, state.window.nextPlayerId);
  updated.window = null;
  return { ok: true, state: updated };
}

export function getPlayerView(state: GameState, playerId: string): GameView {
  const index = playerIndex(state, playerId);
  if (index < 0) throw new RangeError("Player is not in this game.");
  return {
    players: state.players.map((player) => ({
      id: player.id,
      hand:
        player.id === playerId
          ? player.hand.map((card) => ({ ...card }))
          : null,
      cardCount: player.hand.length,
      nikoKadiPressed: player.nikoKadiPressed,
    })),
    deckCount: state.deck.length,
    discard: state.discard.map((card) => ({ ...card })),
    direction: state.direction,
    currentPlayerId: currentPlayer(state).id,
    pendingPenalty: state.pendingPenalty ? { ...state.pendingPenalty } : null,
    activeAceRequest: state.activeAceRequest
      ? { ...state.activeAceRequest }
      : null,
    pendingKingCounter: state.pendingKingCounter
      ? { ...state.pendingKingCounter }
      : null,
    pendingJackCounters: state.pendingJackCounters
      ? { ...state.pendingJackCounters }
      : null,
    window: state.window ? { ...state.window } : null,
    pendingAceChoice: state.pendingAceChoice
      ? {
          ...state.pendingAceChoice,
          request: { ...state.pendingAceChoice.request },
        }
      : null,
    winner: state.winner,
  };
}
