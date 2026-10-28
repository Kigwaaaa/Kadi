import { describe, expect, it } from "vitest";
import {
  applyAction,
  closeWindowByDeadline,
  createGame,
  getLegalMoves,
  getPlayerView,
  type AceRequest,
  type Card,
  type CardRank,
  type GameState,
  type PendingPenalty,
  type Suit,
} from "./index.js";

const constantRng =
  (value = 0.5) =>
  () =>
    value;

function card(suit: Suit | null, rank: CardRank, id?: string): Card {
  return {
    id: id ?? `${suit ?? "joker"}-${rank}-${card.sequence++}`,
    suit,
    rank,
  };
}
card.sequence = 0;

interface ScenarioOptions {
  hands?: Card[][];
  top?: Card;
  discard?: Card[];
  deck?: Card[];
  direction?: 1 | -1;
  currentPlayerIndex?: number;
  pendingPenalty?: PendingPenalty | null;
  activeAceRequest?: AceRequest | null;
  niko?: boolean[];
}

function scenario(options: ScenarioOptions = {}): GameState {
  const hands = options.hands ?? [
    [card("hearts", 6)],
    [card("spades", 9)],
    [card("clubs", 4)],
  ];
  const players = hands.map((hand, index) => ({
    id: `p${index}`,
    hand: [...hand],
    nikoKadiPressed: options.niko?.[index] ?? false,
  }));
  const top = options.top ?? card("hearts", 5);
  const discard = options.discard ?? [top];
  const nikoKadiFlags = Object.fromEntries(
    players.map((player) => [player.id, player.nikoKadiPressed]),
  );
  return {
    players,
    deck: [...(options.deck ?? [card("diamonds", 10)])],
    discard: [...discard],
    direction: options.direction ?? 1,
    currentPlayerIndex: options.currentPlayerIndex ?? 0,
    pendingPenalty: options.pendingPenalty ?? null,
    activeAceRequest: options.activeAceRequest
      ? { ...options.activeAceRequest }
      : null,
    pendingKingCounter: null,
    pendingJackCounters: null,
    window: null,
    nikoKadiFlags,
    pendingAceChoice: null,
    winner: null,
    logicalTimeMs: 0,
  };
}

function apply(
  state: GameState,
  playerId: string,
  action: Parameters<typeof applyAction>[2],
  rng?: () => number,
) {
  return applyAction(state, playerId, action, {
    ...(rng === undefined ? {} : { rng }),
  });
}

function applied(
  state: GameState,
  playerId: string,
  action: Parameters<typeof applyAction>[2],
) {
  const result = apply(state, playerId, action);
  expect(result.ok, result.ok ? undefined : result.error.message).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

function expired(state: GameState) {
  if (!state.window) throw new Error("Expected an open window.");
  const result = closeWindowByDeadline(state, state.window.deadline);
  expect(result.ok, result.ok ? undefined : result.error.message).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

function playAction(...cards: Card[]) {
  return { type: "play" as const, cardIds: cards.map((item) => item.id) };
}

function resultError(
  state: GameState,
  playerId: string,
  action: Parameters<typeof applyAction>[2],
) {
  const before = structuredClone(state);
  const result = apply(state, playerId, action);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Expected action to be rejected.");
  expect(state).toEqual(before);
  return result.error.code;
}

describe("createGame", () => {
  it("deals four cards to 2–6 players and selects only an allowed starting rank", () => {
    for (const playerCount of [2, 3, 4, 5, 6]) {
      const state = createGame(
        Array.from({ length: playerCount }, (_, index) => `p${index}`),
        constantRng(),
      );
      expect(state.players.map((player) => player.hand)).toHaveLength(
        playerCount,
      );
      expect(state.players.every((player) => player.hand.length === 4)).toBe(
        true,
      );
      expect([4, 5, 6, 7, 9, 10]).toContain(state.discard[0]!.rank);
      expect(state.deck).toHaveLength(53 - 4 * playerCount);
      expect(state.direction).toBe(1);
      expect(state.currentPlayerIndex).toBe(0);
      expect(state.pendingPenalty).toBeNull();
      expect(state.activeAceRequest).toBeNull();
    }
  });

  it("allows several skipped players to counter before a skip is consumed", () => {
    const jack = card("hearts", "J");
    const jack1 = card("clubs", "J");
    const jack2 = card("spades", "J");
    let state = scenario({
      hands: [[jack], [jack1], [jack2], [card("diamonds", 7)]],
      top: card("hearts", 5),
    });
    state = applied(state, "p0", playAction(jack));
    state = applied(state, "p1", {
      type: "counter",
      kind: "jack",
      cardIds: [jack1.id],
    });
    state = applied(state, "p2", {
      type: "counter",
      kind: "jack",
      cardIds: [jack2.id],
    });
    expect(state.pendingJackCounters?.playerId).toBe("p3");
    state = expired(state);
    expect(state.players[state.currentPlayerIndex]!.id).toBe("p0");
  });

  it("creates a complete 54-card deck with distinct ids and deterministic RNG output", () => {
    const first = createGame(["a", "b"], constantRng(0.25));
    const second = createGame(["a", "b"], constantRng(0.25));
    expect(first).toEqual(second);
    const cards = [
      ...first.players.flatMap((player) => player.hand),
      ...first.deck,
      ...first.discard,
    ];
    expect(cards).toHaveLength(54);
    expect(new Set(cards.map((item) => item.id)).size).toBe(54);
    expect(
      cards.every((item) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          item.id,
        ),
      ),
    ).toBe(true);
  });

  it.each([
    [[]],
    [["a"]],
    [["a", "a"]],
    [Array.from({ length: 7 }, (_, index) => `p${index}`)],
  ])("rejects invalid player lists %j", (ids) => {
    expect(() => createGame(ids, constantRng())).toThrow(RangeError);
  });

  it("rejects an out-of-range injected RNG value", () => {
    expect(() => createGame(["a", "b"], () => 1)).toThrow(RangeError);
  });
});

describe("playing cards", () => {
  it("allows a same-rank multi-card play and uses the last card as the new top", () => {
    const fiveClubs = card("clubs", 5);
    const fiveSpades = card("spades", 5);
    const state = scenario({
      hands: [[fiveClubs, fiveSpades], [card("hearts", 7)]],
      top: card("hearts", 5),
    });
    const next = applied(state, "p0", playAction(fiveClubs, fiveSpades));
    expect(next.discard.slice(-2)).toEqual([fiveClubs, fiveSpades]);
    expect(next.players[0]!.hand).toHaveLength(0);
    expect(next.window?.nextPlayerId).toBe("p1");
  });

  it("rejects a same-rank group if its first card cannot be played", () => {
    const fourClubs = card("clubs", 4);
    const fourSpades = card("spades", 4);
    const state = scenario({
      hands: [[fourClubs, fourSpades], [card("diamonds", 7)]],
      top: card("hearts", 5),
    });
    expect(resultError(state, "p0", playAction(fourClubs, fourSpades))).toBe(
      "ILLEGAL_PLAY",
    );
  });

  it("requires distinct owned cards and rejects unknown action fields", () => {
    const owned = card("hearts", 5);
    const state = scenario({ hands: [[owned], [card("diamonds", 7)]] });
    expect(
      resultError(state, "p0", {
        type: "play",
        cardIds: [owned.id, owned.id],
      }),
    ).toBe("INVALID_CARDS");
    expect(
      resultError(state, "p0", {
        type: "draw",
        illegal: true,
      } as unknown as Parameters<typeof applyAction>[2]),
    ).toBe("INVALID_ACTION");
    expect(resultError(state, "p0", playAction(card("hearts", 5)))).toBe(
      "CARD_NOT_OWNED",
    );
  });

  it("does not share mutable cards between the input and a successful result", () => {
    const played = card("hearts", 6);
    const state = scenario({ hands: [[played], [card("clubs", 7)]] });
    const next = applied(state, "p0", playAction(played));
    next.discard.at(-1)!.rank = 2;
    expect(state.players[0]!.hand[0]!.rank).toBe(6);
    const view = getPlayerView(state, "p0");
    view.players[0]!.hand![0]!.rank = 3;
    expect(state.players[0]!.hand[0]!.rank).toBe(6);
  });

  it("requires Q and 8 cards to match the top suit and include a companion", () => {
    const queen = card("hearts", "Q");
    const companion = card("hearts", 4);
    const state = scenario({
      hands: [[queen, companion], [card("clubs", 9)]],
      top: card("hearts", 5),
    });
    expect(
      applied(state, "p0", playAction(queen, companion)).discard.slice(-2),
    ).toEqual([queen, companion]);

    const wrongSuitQueen = card("clubs", "Q");
    const wrongSuitState = scenario({
      hands: [[wrongSuitQueen, card("clubs", 4)], [card("spades", 9)]],
      top: card("hearts", 5),
    });
    expect(
      resultError(
        wrongSuitState,
        "p0",
        playAction(wrongSuitQueen, wrongSuitState.players[0]!.hand[1]!),
      ),
    ).toBe("ILLEGAL_PLAY");
    expect(resultError(state, "p0", playAction(queen))).toBe("ILLEGAL_PLAY");
  });

  it("supports Q/8 chains matching by suit or by rank, then requires the final chain suit", () => {
    const queenHearts = card("hearts", "Q");
    const eightHearts = card("hearts", 8);
    const companionHearts = card("hearts", 6);
    const sixClubs = card("clubs", 6);
    const suitChain = scenario({
      hands: [
        [queenHearts, eightHearts, companionHearts, sixClubs],
        [card("diamonds", 7)],
      ],
      top: card("hearts", 5),
    });
    const valid = applied(
      suitChain,
      "p0",
      playAction(queenHearts, eightHearts, companionHearts, sixClubs),
    );
    expect(valid.discard.slice(-4)).toEqual([
      queenHearts,
      eightHearts,
      companionHearts,
      sixClubs,
    ]);

    const queenSpades = card("spades", "Q");
    const spadeCompanion = card("spades", 9);
    const rankChain = scenario({
      hands: [[queenHearts, queenSpades, spadeCompanion], [card("clubs", 7)]],
      top: card("hearts", 5),
    });
    expect(
      applied(
        rankChain,
        "p0",
        playAction(queenHearts, queenSpades, spadeCompanion),
      ).discard.slice(-3),
    ).toEqual([queenHearts, queenSpades, spadeCompanion]);

    const invalidChain = scenario({
      hands: [
        [queenHearts, card("spades", 8), card("spades", 7)],
        [card("clubs", 7)],
      ],
      top: card("hearts", 5),
    });
    expect(
      resultError(
        invalidChain,
        "p0",
        playAction(...invalidChain.players[0]!.hand),
      ),
    ).toBe("ILLEGAL_PLAY");
  });

  it("checks each Q/8 chain link against the immediately preceding card", () => {
    const chain = [
      card("hearts", "Q"),
      card("hearts", 8),
      card("spades", 8),
      card("spades", "Q"),
      card("spades", 6),
    ];
    const state = scenario({
      hands: [chain, [card("clubs", 7)]],
      top: card("hearts", 5),
    });
    expect(
      applied(state, "p0", playAction(...chain)).discard.slice(-5),
    ).toEqual(chain);
  });

  it("allows the documented any-card-of-the-suit Q/8 companion assumption", () => {
    const queen = card("hearts", "Q");
    const ace = card("hearts", "A");
    const state = scenario({
      hands: [[queen, ace], [card("clubs", 9)]],
      top: card("hearts", 5),
    });
    expect(
      applied(state, "p0", playAction(queen, ace)).discard.slice(-2),
    ).toEqual([queen, ace]);
  });
});

describe("penalties", () => {
  const penaltyCases: Array<{
    name: string;
    pendingRank: CardRank;
    answerRank: CardRank;
    answerSuit: Suit | null;
    allowed: boolean;
  }> = [
    {
      name: "2 answered by any 2",
      pendingRank: 2,
      answerRank: 2,
      answerSuit: "clubs",
      allowed: true,
    },
    {
      name: "2 answered by Joker",
      pendingRank: 2,
      answerRank: "JOKER",
      answerSuit: null,
      allowed: true,
    },
    {
      name: "2 answered by same-suit 3",
      pendingRank: 2,
      answerRank: 3,
      answerSuit: "hearts",
      allowed: true,
    },
    {
      name: "2 rejects a different-suit 3",
      pendingRank: 2,
      answerRank: 3,
      answerSuit: "clubs",
      allowed: false,
    },
    {
      name: "3 answered by any 3",
      pendingRank: 3,
      answerRank: 3,
      answerSuit: "clubs",
      allowed: true,
    },
    {
      name: "3 answered by Joker",
      pendingRank: 3,
      answerRank: "JOKER",
      answerSuit: null,
      allowed: true,
    },
    {
      name: "3 answered by same-suit 2",
      pendingRank: 3,
      answerRank: 2,
      answerSuit: "hearts",
      allowed: true,
    },
    {
      name: "3 rejects a different-suit 2",
      pendingRank: 3,
      answerRank: 2,
      answerSuit: "clubs",
      allowed: false,
    },
    {
      name: "Joker answered by Joker",
      pendingRank: "JOKER",
      answerRank: "JOKER",
      answerSuit: null,
      allowed: true,
    },
    {
      name: "Joker rejects a 2",
      pendingRank: "JOKER",
      answerRank: 2,
      answerSuit: "hearts",
      allowed: false,
    },
  ];

  it.each(penaltyCases)(
    "$name",
    ({ pendingRank, answerRank, answerSuit, allowed }) => {
      const source = card(
        pendingRank === "JOKER" ? null : "hearts",
        pendingRank,
      );
      const answer = card(answerSuit, answerRank);
      const amount = pendingRank === 2 ? 2 : pendingRank === 3 ? 3 : 5;
      const state = scenario({
        hands: [[card("clubs", 7)], [answer]],
        top: source,
        currentPlayerIndex: 1,
        pendingPenalty: { amount, cardId: source.id },
      });
      const result = apply(state, "p1", playAction(answer));
      expect(result.ok).toBe(allowed);
      if (result.ok && allowed) {
        expect(result.state.pendingPenalty?.amount).toBe(
          answerRank === 2 ? 2 : answerRank === 3 ? 3 : 5,
        );
      } else if (!allowed) {
        expect(result.ok ? "unexpected success" : result.error.code).toBe(
          "ILLEGAL_PLAY",
        );
      }
    },
  );

  it("uses the top-most penalty amount without accumulating", () => {
    const two = card("hearts", 2);
    const three = card("hearts", 3);
    const state = scenario({
      hands: [[card("clubs", 7)], [three]],
      top: two,
      currentPlayerIndex: 1,
      pendingPenalty: { amount: 2, cardId: two.id },
    });
    const next = applied(state, "p1", playAction(three));
    expect(next.pendingPenalty).toEqual({ amount: 3, cardId: three.id });
  });

  it("draws the penalty amount and ends the turn", () => {
    const two = card("hearts", 2);
    const state = scenario({
      hands: [[card("clubs", 7)], [card("clubs", 5)]],
      top: two,
      currentPlayerIndex: 1,
      pendingPenalty: { amount: 2, cardId: two.id },
      deck: [card("clubs", 4), card("spades", 6), card("diamonds", 8)],
    });
    const next = applied(state, "p1", { type: "draw" });
    expect(next.players[1]!.hand).toHaveLength(3);
    expect(next.pendingPenalty).toBeNull();
    expect(next.window?.nextPlayerId).toBe("p0");
  });

  it.each([
    { rank: 2 as const, answerRank: 2 as const, amount: 2 },
    { rank: 3 as const, answerRank: 3 as const, amount: 3 },
    { rank: "JOKER" as const, answerRank: "JOKER" as const, amount: 5 },
  ])(
    "allows drawing $amount cards while facing a playable $rank penalty answer",
    ({ rank, answerRank, amount }) => {
      const source = card(rank === "JOKER" ? null : "hearts", rank);
      const answer = card(answerRank === "JOKER" ? null : "clubs", answerRank);
      const state = scenario({
        hands: [[card("diamonds", 7)], [answer]],
        top: source,
        currentPlayerIndex: 1,
        pendingPenalty: {
          amount: amount as 2 | 3 | 5,
          cardId: source.id,
        },
        deck: Array.from({ length: amount }, (_, index) =>
          card("spades", (index + 4) as 4 | 5 | 6 | 7 | 8 | 9 | 10),
        ),
      });

      const legalMoves = getLegalMoves(state, "p1");
      expect(legalMoves.some((move) => move.type === "play")).toBe(true);
      expect(legalMoves).toContainEqual({ type: "draw" });
      const next = applied(state, "p1", { type: "draw" });

      expect(next.players[1]!.hand).toHaveLength(amount + 1);
      expect(next.pendingPenalty).toBeNull();
      expect(next.window?.actionType).toBe("draw");
    },
  );

  it("allows an Ace request to be answered by a matching card", () => {
    const match = card("spades", 9);
    const state = scenario({
      hands: [[card("clubs", 7)], [match], [card("diamonds", 6)]],
      top: card("spades", 5),
      currentPlayerIndex: 1,
      activeAceRequest: {
        byPlayerId: "p0",
        suit: "spades",
        remainingPlayers: 2,
      },
    });
    const next = applied(state, "p1", playAction(match));
    expect(next.activeAceRequest).toBeNull();
    expect(next.discard.at(-1)).toEqual(match);
  });

  it("allows a Joker at any time and assigns its five-card penalty", () => {
    const joker = card(null, "JOKER");
    const state = scenario({
      hands: [[joker], [card("clubs", 5)]],
      top: card("hearts", 7),
    });
    const next = applied(state, "p0", playAction(joker));
    expect(next.pendingPenalty).toEqual({ amount: 5, cardId: joker.id });
  });

  it("cancels a penalty with an Ace and requests exactly one suit or number", () => {
    const ace = card("clubs", "A");
    const two = card("hearts", 2);
    const state = scenario({
      hands: [[ace], [card("clubs", 7)]],
      top: two,
      pendingPenalty: { amount: 2, cardId: two.id },
    });
    expect(resultError(state, "p0", { type: "play", cardIds: [ace.id] })).toBe(
      "ACE_REQUEST_REQUIRED",
    );
    const next = applied(state, "p0", {
      type: "play",
      cardIds: [ace.id],
      aceRequest: { suit: "spades" },
    });
    expect(next.pendingPenalty).toBeNull();
    expect(next.activeAceRequest?.suit).toBe("spades");
    expect(next.activeAceRequest?.rank).toBeUndefined();
  });

  it.each([
    { rank: 2 as const, amount: 2 },
    { rank: 3 as const, amount: 3 },
    { rank: "JOKER" as const, amount: 5 },
  ])("allows an Ace to cancel a $rank penalty", ({ rank, amount }) => {
    const ace = card("clubs", "A");
    const source = card(rank === "JOKER" ? null : "hearts", rank);
    const state = scenario({
      hands: [[ace], [card("diamonds", 7)]],
      top: source,
      pendingPenalty: { amount: amount as 2 | 3 | 5, cardId: source.id },
    });
    const next = applied(state, "p0", {
      type: "play",
      cardIds: [ace.id],
      aceRequest: { rank: 7 },
    });
    expect(next.pendingPenalty).toBeNull();
    expect(next.activeAceRequest?.rank).toBe(7);
  });
});

describe("Aces and requests", () => {
  it("draws one card during an Ace request and passes the request onward", () => {
    const matchingCard = card("spades", 6);
    const state = scenario({
      hands: [
        [card("clubs", 7)],
        [matchingCard],
        [card("diamonds", 9)],
      ],
      top: card("spades", 5),
      currentPlayerIndex: 1,
      activeAceRequest: {
        byPlayerId: "p0",
        suit: "spades",
        remainingPlayers: 2,
      },
      deck: [card("clubs", 4)],
    });

    const legalMoves = getLegalMoves(state, "p1");
    expect(legalMoves.some((move) => move.type === "play")).toBe(true);
    expect(legalMoves).toContainEqual({ type: "draw" });
    const next = applied(state, "p1", { type: "draw" });

    expect(next.players[1]!.hand).toHaveLength(2);
    expect(next.activeAceRequest).toMatchObject({
      byPlayerId: "p0",
      suit: "spades",
      remainingPlayers: 1,
    });
    expect(next.currentPlayerIndex).toBe(2);
  });

  it("requires one Ace to request a suit or number, and two Aces to request both", () => {
    const one = card("clubs", "A");
    const oneState = scenario({ hands: [[one], [card("clubs", 7)]] });
    expect(
      resultError(oneState, "p0", {
        type: "play",
        cardIds: [one.id],
        aceRequest: { suit: "clubs", rank: 4 },
      }),
    ).toBe("ACE_REQUEST_INVALID");

    const ace1 = card("clubs", "A");
    const ace2 = card("spades", "A");
    const twoState = scenario({
      hands: [[ace1, ace2], [card("clubs", 7)]],
    });
    expect(
      resultError(twoState, "p0", {
        type: "play",
        cardIds: [ace1.id, ace2.id],
        aceRequest: { suit: "hearts" },
      }),
    ).toBe("ACE_REQUEST_INVALID");
    const played = applied(twoState, "p0", {
      type: "play",
      cardIds: [ace1.id, ace2.id],
      aceRequest: { suit: "hearts", rank: 4 },
    });
    expect(played.activeAceRequest).toMatchObject({
      byPlayerId: "p0",
      suit: "hearts",
      rank: 4,
      remainingPlayers: 1,
    });

    const triple = [
      card("clubs", "A"),
      card("hearts", "A"),
      card("spades", "A"),
    ];
    const tripleState = scenario({
      hands: [triple, [card("diamonds", 7)]],
    });
    expect(
      resultError(tripleState, "p0", {
        type: "play",
        cardIds: triple.map((item) => item.id),
        aceRequest: { suit: "hearts", rank: 4 },
      }),
    ).toBe("ILLEGAL_PLAY");
  });

  it("binds both the requested suit and number when two Aces were played", () => {
    const suitedMatch = card("hearts", 4);
    const wrongNumber = card("hearts", 5);
    const state = scenario({
      hands: [[card("clubs", 7)], [suitedMatch, wrongNumber]],
      top: card("hearts", 5),
      currentPlayerIndex: 1,
      activeAceRequest: {
        byPlayerId: "p0",
        suit: "hearts",
        rank: 4,
        remainingPlayers: 1,
      },
    });
    expect(getLegalMoves(state, "p1")).toContainEqual(
      expect.objectContaining({
        type: "play",
        cardIds: [suitedMatch.id],
      }),
    );
    expect(resultError(state, "p1", playAction(wrongNumber))).toBe(
      "ILLEGAL_PLAY",
    );
    expect(getLegalMoves(state, "p1")).toContainEqual({ type: "draw" });
    const drawn = applied(state, "p1", { type: "draw" });
    expect(drawn.players[1]!.hand).toHaveLength(3);
  });

  it("binds the next player to the request and expires after one full rotation", () => {
    const ace = card("clubs", "A");
    const state = scenario({
      hands: [[ace], [card("clubs", 9)], [card("diamonds", 7)]],
      deck: [card("clubs", 4), card("diamonds", 6), card("spades", 8)],
    });
    let next = applied(state, "p0", {
      type: "play",
      cardIds: [ace.id],
      aceRequest: { suit: "spades" },
    });
    next = expired(next);
    expect(next.activeAceRequest?.byPlayerId).toBe("p0");
    next = applied(next, "p1", { type: "draw" });
    next = expired(next);
    expect(next.activeAceRequest?.remainingPlayers).toBe(1);
    next = applied(next, "p2", { type: "draw" });
    expect(next.activeAceRequest).toBeNull();
    expect(next.currentPlayerIndex).toBe(0);
  });

  it("lets an Ace cancel an active request and binds the next turn to its suit", () => {
    const ace = card("spades", "A");
    const state = scenario({
      hands: [[card("clubs", 9)], [ace]],
      currentPlayerIndex: 1,
      activeAceRequest: {
        byPlayerId: "p0",
        suit: "hearts",
        remainingPlayers: 1,
      },
    });
    const next = applied(state, "p1", {
      type: "counter",
      kind: "ace",
      cardIds: [ace.id],
    });
    expect(next.activeAceRequest).toMatchObject({
      byPlayerId: "p1",
      suit: "spades",
    });
    expect(next.window?.nextPlayerId).toBe("p0");
  });

  it("lets the original player partially cancel a two-Ace request after one-Ace response", () => {
    const aceA = card("clubs", "A");
    const aceB = card("diamonds", "A");
    const responderAce = card("spades", "A");
    let state = scenario({
      hands: [[card("hearts", 4)], [responderAce], [card("clubs", 4)]],
      activeAceRequest: {
        byPlayerId: "p0",
        suit: "hearts",
        rank: 4,
        remainingPlayers: 2,
      },
    });
    state.players[0]!.hand = [aceA, aceB];
    state = expired({
      ...state,
      window: {
        openedAt: 0,
        deadline: 5_000,
        actorId: "p0",
        nextPlayerId: "p1",
        actionType: "play",
        counterKind: "ace",
      },
    });
    state = applied(state, "p1", {
      type: "counter",
      kind: "ace",
      cardIds: [responderAce.id],
    });
    expect(state.pendingAceChoice?.chooserId).toBe("p0");
    const choice = applied(state, "p0", {
      type: "chooseAceRequest",
      forgo: "suit",
    });
    expect(choice.activeAceRequest).toMatchObject({ rank: 4 });
    expect(choice.activeAceRequest?.suit).toBeUndefined();
    expect(choice.window?.nextPlayerId).toBe("p2");
  });

  it("cancels both parts when answered by two Aces and continues with the last Ace suit", () => {
    const ace1 = card("clubs", "A");
    const ace2 = card("hearts", "A");
    const state = scenario({
      hands: [[card("clubs", 7)], [ace1, ace2]],
      currentPlayerIndex: 1,
      activeAceRequest: {
        byPlayerId: "p0",
        suit: "spades",
        rank: 4,
        remainingPlayers: 1,
      },
    });
    const next = applied(state, "p1", {
      type: "counter",
      kind: "ace",
      cardIds: [ace1.id, ace2.id],
    });
    expect(next.activeAceRequest).toMatchObject({
      byPlayerId: "p1",
      suit: "hearts",
    });
    expect(next.activeAceRequest?.rank).toBeUndefined();
  });

  it("does not allow the requested Ace owner to cancel their own request", () => {
    const ace = card("hearts", "A");
    const state = scenario({
      hands: [[ace], [card("clubs", 9)]],
      activeAceRequest: {
        byPlayerId: "p0",
        suit: "spades",
        remainingPlayers: 1,
      },
    });
    expect(
      resultError(state, "p0", {
        type: "counter",
        kind: "ace",
        cardIds: [ace.id],
      }),
    ).toBe("WRONG_COUNTER");
  });
});

describe("Kings and Jacks", () => {
  it("reverses direction and allows a King counter chain", () => {
    const king0 = card("hearts", "K");
    const king2 = card("clubs", "K");
    const king0Again = card("spades", "K");
    let state = scenario({
      hands: [[king0, king0Again], [card("diamonds", 7)], [king2]],
      top: card("hearts", 5),
    });
    state = applied(state, "p0", playAction(king0));
    expect(state.direction).toBe(-1);
    expect(state.pendingKingCounter?.playerId).toBe("p2");
    expect(getLegalMoves(state, "p1")).toEqual([]);
    expect(getLegalMoves(state, "p2")).toContainEqual({
      type: "counter",
      kind: "king",
      cardIds: [king2.id],
    });
    state = applied(state, "p2", {
      type: "counter",
      kind: "king",
      cardIds: [king2.id],
    });
    expect(state.direction).toBe(1);
    expect(state.pendingKingCounter?.playerId).toBe("p0");
    state = applied(state, "p0", {
      type: "counter",
      kind: "king",
      cardIds: [king0Again.id],
    });
    expect(state.direction).toBe(-1);
    expect(state.pendingKingCounter?.playerId).toBe("p2");
    state = expired(state);
    expect(state.currentPlayerIndex).toBe(2);
    expect(state.pendingKingCounter).toBeNull();
  });

  it("cancels an even number of Kings played together", () => {
    const king1 = card("hearts", "K");
    const king2 = card("clubs", "K");
    const state = scenario({
      hands: [[king1, king2], [card("spades", 7)], [card("clubs", 8)]],
      top: card("hearts", 5),
    });
    const next = applied(state, "p0", playAction(king1, king2));
    expect(next.direction).toBe(1);
    expect(next.pendingKingCounter).toBeNull();
    expect(next.window?.counterKind).toBeNull();
  });

  it("lets every skipped player counter a multi-Jack play in sequence", () => {
    const jack1 = card("hearts", "J");
    const jack2 = card("clubs", "J");
    const counterJack = card("spades", "J");
    let state = scenario({
      hands: [
        [jack1, jack2],
        [counterJack],
        [card("diamonds", 7)],
        [card("hearts", 9)],
      ],
      top: card("hearts", 5),
    });
    state = applied(state, "p0", playAction(jack1, jack2));
    expect(state.pendingJackCounters?.remainingSkips).toBe(2);
    state = applied(state, "p1", {
      type: "counter",
      kind: "jack",
      cardIds: [counterJack.id],
    });
    expect(state.pendingJackCounters?.playerId).toBe("p2");
    state = expired(state);
    expect(state.pendingJackCounters?.remainingSkips).toBe(1);
    expect(state.pendingJackCounters?.playerId).toBe("p3");
    state = expired(state);
    expect(state.pendingJackCounters).toBeNull();
    expect(state.players[state.currentPlayerIndex]!.id).toBe("p0");
  });

  it("resolves two skipped players when neither counters", () => {
    const jack1 = card("hearts", "J");
    const jack2 = card("clubs", "J");
    let state = scenario({
      hands: [
        [jack1, jack2],
        [card("clubs", 4)],
        [card("diamonds", 7)],
        [card("hearts", 9)],
      ],
      top: card("hearts", 5),
    });
    state = applied(state, "p0", playAction(jack1, jack2));
    state = expired(state);
    expect(state.pendingJackCounters?.playerId).toBe("p2");
    state = expired(state);
    expect(state.currentPlayerIndex).toBe(3);
    expect(state.pendingJackCounters).toBeNull();
  });

  it("gives the same player another turn after a King or Jack in a two-player game", () => {
    for (const rank of ["K", "J"] as const) {
      const special = card("hearts", rank);
      let state = scenario({
        hands: [[special], [card("clubs", 7)]],
        top: card("hearts", 5),
      });
      state = applied(state, "p0", playAction(special));
      expect(state.window?.nextPlayerId).toBe("p1");
      state = expired(state);
      expect(state.players[state.currentPlayerIndex]!.id).toBe("p0");
    }
  });

  it("allows a two-player King counter before returning the turn to the counterer", () => {
    const firstKing = card("hearts", "K");
    const secondKing = card("clubs", "K");
    let state = scenario({
      hands: [[firstKing], [secondKing]],
      top: card("hearts", 5),
    });
    state = applied(state, "p0", playAction(firstKing));
    expect(state.pendingKingCounter?.playerId).toBe("p1");
    state = applied(state, "p1", {
      type: "counter",
      kind: "king",
      cardIds: [secondKing.id],
    });
    expect(state.pendingKingCounter?.playerId).toBe("p0");
    state = expired(state);
    expect(state.players[state.currentPlayerIndex]!.id).toBe("p1");
  });
});

describe("turns, windows, and drawing", () => {
  it.each([
    { rank: 2 as const, amount: 2 },
    { rank: 3 as const, amount: 3 },
    { rank: "JOKER" as const, amount: 5 },
  ])(
    "makes a player pick up $amount cards for a $rank penalty",
    ({ rank, amount }) => {
      const source = card(rank === "JOKER" ? null : "hearts", rank);
      const state = scenario({
        hands: [[card("clubs", 7)], [card("clubs", 5)]],
        top: source,
        currentPlayerIndex: 1,
        pendingPenalty: { amount: amount as 2 | 3 | 5, cardId: source.id },
        deck: Array.from({ length: amount }, (_, index) =>
          card("diamonds", 4 + (index % 4)),
        ),
      });
      const next = applied(state, "p1", { type: "draw" });
      expect(next.players[1]!.hand).toHaveLength(amount + 1);
      expect(next.window?.nextPlayerId).toBe("p0");
    },
  );

  it("opens a five-second window after a play and rejects early expiry or turn actions", () => {
    const six = card("hearts", 6);
    const state = scenario({ hands: [[six], [card("clubs", 7)]] });
    const next = applied(state, "p0", playAction(six));
    expect(next.window?.deadline).toBe(5_000);
    expect(
      closeWindowByDeadline(next, next.window!.deadline - 1),
    ).toMatchObject({ ok: false, error: { code: "WINDOW_NOT_EXPIRED" } });
    expect(resultError(next, "p1", { type: "draw" })).toBe("WINDOW_OPEN");
    expect(
      applyAction(next, "p0", { type: "nikoKadi" }, { nowMs: 5_000 }),
    ).toMatchObject({ ok: false, error: { code: "WINDOW_EXPIRED" } });
    expect(expired(next).currentPlayerIndex).toBe(1);
  });

  it("rejects counter actions at or after the server deadline", () => {
    const king = card("hearts", "K");
    const counterKing = card("clubs", "K");
    const state = scenario({
      hands: [[king], [counterKing], [card("diamonds", 7)]],
      top: card("hearts", 5),
    });
    const next = applied(state, "p0", playAction(king));
    const before = structuredClone(next);
    const result = applyAction(
      next,
      "p2",
      { type: "counter", kind: "king", cardIds: [counterKing.id] },
      { nowMs: next.window!.deadline },
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "WINDOW_EXPIRED" },
    });
    expect(next).toEqual(before);
  });

  it("allows drawing even when a legal play exists", () => {
    const state = scenario({
      hands: [[card("hearts", 7)], [card("hearts", 8)]],
      top: card("hearts", 5),
      deck: [card("spades", 4)],
    });
    expect(getLegalMoves(state, "p0")).toContainEqual({ type: "draw" });
    const next = applied(state, "p0", { type: "draw" });
    expect(next.players[0]!.hand).toHaveLength(2);
    expect(next.window?.actionType).toBe("draw");
    expect(resultError(state, "p1", { type: "draw" })).toBe("NOT_YOUR_TURN");
    expect(resultError(next, "p1", { type: "draw" })).toBe("WINDOW_OPEN");
  });

  it("reshuffles the discard pile while preserving its top card", () => {
    const top = card("hearts", 5);
    const recyclable1 = card("clubs", 2);
    const recyclable2 = card("spades", 4);
    const state = scenario({
      hands: [[card("clubs", 7)], [card("diamonds", 9)]],
      discard: [recyclable1, recyclable2, top],
      top,
      deck: [],
    });
    expect(resultError(state, "p0", { type: "draw" })).toBe("RNG_REQUIRED");
    const next = apply(state, "p0", { type: "draw" }, constantRng());
    expect(next.ok).toBe(true);
    if (!next.ok) throw new Error(next.error.message);
    expect(next.state.discard).toEqual([top]);
    expect(next.state.deck).toHaveLength(1);
    expect(next.state.players[0]!.hand[1]).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/clubs-2|spades-4/),
      }),
    );
  });

  it("rejects a draw without mutating state if no cards are available", () => {
    const top = card("hearts", 5);
    const state = scenario({
      hands: [[card("clubs", 7)], [card("diamonds", 9)]],
      discard: [top],
      top,
      deck: [],
    });
    expect(resultError(state, "p0", { type: "draw" })).toBe("DECK_EXHAUSTED");
  });

  it("requires a zero-card player to draw one card on their turn", () => {
    const state = scenario({
      hands: [[], [card("clubs", 7)]],
      currentPlayerIndex: 0,
      deck: [card("diamonds", 9)],
    });
    expect(getLegalMoves(state, "p0")).toEqual([{ type: "draw" }]);
    const next = applied(state, "p0", { type: "draw" });
    expect(next.players[0]!.hand).toHaveLength(1);
  });

  it("hides opponent hands and the deck from every player view", () => {
    const state = scenario();
    const view = getPlayerView(state, "p0");
    expect(view.players[0]!.hand).toEqual(state.players[0]!.hand);
    expect(view.players[1]!.hand).toBeNull();
    expect(view.deckCount).toBe(state.deck.length);
    expect("deck" in view).toBe(false);
    expect(() => getPlayerView(state, "missing")).toThrow(RangeError);
  });
});

describe("Niko Kadi and winning", () => {
  it("is available only after a play in its window and requires at least one card per player", () => {
    const played = card("hearts", 4);
    const state = scenario({
      hands: [[played, card("clubs", 10)], [card("diamonds", 9)]],
      top: card("hearts", 5),
    });
    const next = applied(state, "p0", playAction(played));
    expect(getLegalMoves(next, "p0")).toContainEqual({ type: "nikoKadi" });
    const pressed = applied(next, "p0", { type: "nikoKadi" });
    expect(pressed.players[0]!.nikoKadiPressed).toBe(true);

    const emptyPlayer = scenario({
      hands: [[card("hearts", 4), card("clubs", 10)], []],
    });
    const emptyPlayed = applied(
      emptyPlayer,
      "p0",
      playAction(emptyPlayer.players[0]!.hand[0]!),
    );
    expect(getLegalMoves(emptyPlayed, "p0")).not.toContainEqual({
      type: "nikoKadi",
    });
  });

  it("wins only after Niko Kadi, with a plain final card and every hand non-empty before play", () => {
    const firstPlay = card("hearts", 4);
    const lastCard = card("hearts", 10);
    const opponentPlay = card("hearts", 7);
    const state = scenario({
      hands: [
        [firstPlay, lastCard],
        [opponentPlay, card("clubs", 9)],
      ],
      top: card("hearts", 5),
    });
    let next = applied(state, "p0", playAction(firstPlay));
    next = applied(next, "p0", { type: "nikoKadi" });
    next = expired(next);
    next = applied(next, "p1", playAction(opponentPlay));
    next = expired(next);
    const winningPlay = apply(next, "p0", playAction(lastCard));
    expect(winningPlay.ok).toBe(true);
    if (!winningPlay.ok) throw new Error(winningPlay.error.message);
    expect(winningPlay.state.winner).toBe("p0");
    expect(winningPlay.state.players[0]!.hand).toHaveLength(0);
  });

  it("does not win by finishing with a special card or without Niko Kadi", () => {
    for (const rank of [2, 3, 8, "Q", "K", "J", "JOKER", "A"] as const) {
      const finish = card(rank === "JOKER" ? null : "hearts", rank);
      const state = scenario({
        hands: [[finish], [card("clubs", 7)]],
        top: card("hearts", 5),
        niko: [true, false],
      });
      const aceChoice =
        rank === "A" ? { aceRequest: { suit: "clubs" as const } } : {};
      const result = apply(state, "p0", {
        type: "play",
        cardIds: [finish.id],
        ...aceChoice,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("ILLEGAL_PLAY");
    }

    const plain = card("hearts", 4);
    const noCall = scenario({
      hands: [[plain], [card("clubs", 7)]],
      top: card("hearts", 5),
    });
    const continued = applied(noCall, "p0", playAction(plain));
    expect(continued.winner).toBeNull();
    expect(continued.players[0]!.hand).toHaveLength(0);
  });

  it("does not win if any player had zero cards before the finishing play", () => {
    const finish = card("hearts", 4);
    const state = scenario({
      hands: [[finish], []],
      top: card("hearts", 5),
    });
    const next = applied(state, "p0", playAction(finish));
    expect(next.winner).toBeNull();
  });

  it("cancels Niko Kadi after a pickup and requires a new press", () => {
    const six = card("hearts", 6);
    const state = scenario({
      hands: [[six, card("clubs", 7)], [card("spades", 9)]],
      deck: [card("spades", 3), card("clubs", 4), card("diamonds", 6)],
    });
    let next = applied(state, "p0", playAction(six));
    next = applied(next, "p0", { type: "nikoKadi" });
    next = expired(next);
    next = applied(next, "p1", { type: "draw" });
    next = expired(next);
    next = applied(next, "p0", { type: "draw" });
    expect(next.players[0]!.nikoKadiPressed).toBe(false);
    expect(next.nikoKadiFlags.p0).toBe(false);
  });

  it("allows a player to draw after pressing Niko Kadi even when they can win", () => {
    const firstPlay = card("hearts", 6);
    const finisher = card("hearts", 7);
    const state = scenario({
      hands: [[firstPlay, finisher], [card("clubs", 9)]],
      top: card("hearts", 5),
      deck: [card("diamonds", 4), card("spades", 10)],
    });
    let next = applied(state, "p0", playAction(firstPlay));
    next = applied(next, "p0", { type: "nikoKadi" });
    next = expired(next);
    next = applied(next, "p1", { type: "draw" });
    next = expired(next);

    const legalMoves = getLegalMoves(next, "p0");
    expect(legalMoves.some((move) => move.type === "play")).toBe(true);
    expect(legalMoves).toContainEqual({ type: "draw" });
    next = applied(next, "p0", { type: "draw" });

    expect(next.players[0]!.nikoKadiPressed).toBe(false);
    expect(next.nikoKadiFlags.p0).toBe(false);
    expect(next.players[0]!.hand).toHaveLength(2);
  });

  it("makes a Niko Kadi player who cannot finish draw one penalty card on their next turn", () => {
    const six = card("hearts", 6);
    const state = scenario({
      hands: [[six, card("clubs", 7)], [card("diamonds", 9)]],
      deck: [card("spades", 4), card("clubs", 3)],
    });
    let next = applied(state, "p0", playAction(six));
    next = applied(next, "p0", { type: "nikoKadi" });
    next = expired(next);
    next = applied(next, "p1", { type: "draw" });
    next = expired(next);
    expect(getLegalMoves(next, "p0")).toEqual([{ type: "draw" }]);
    next = applied(next, "p0", { type: "draw" });
    expect(next.players[0]!.hand).toHaveLength(2);
    expect(next.players[0]!.nikoKadiPressed).toBe(false);
  });

  it("keeps Niko Kadi active if a player can finish but chooses another legal play", () => {
    const nonFinisher = card("hearts", 6);
    const finisher = card("clubs", 6);
    const state = scenario({
      hands: [[nonFinisher, finisher], [card("clubs", 7)]],
      top: card("hearts", 5),
      niko: [true, false],
    });
    const next = applied(state, "p0", playAction(nonFinisher));
    expect(next.players[0]!.nikoKadiPressed).toBe(true);
    expect(next.nikoKadiFlags.p0).toBe(true);
  });

  it("requires a fresh Niko Kadi press after an invalid empty-hand finish", () => {
    const special = card("hearts", 2);
    const state = scenario({
      hands: [[special], [card("clubs", 7)]],
      top: card("hearts", 5),
    });
    const next = applied(state, "p0", playAction(special));
    expect(next.players[0]!.hand).toHaveLength(0);
    expect(next.window).not.toBeNull();
    expect(getLegalMoves(next, "p0")).not.toContainEqual({
      type: "nikoKadi",
    });
  });
});
