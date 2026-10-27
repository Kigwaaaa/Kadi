import type { Metadata } from "next";
import Link from "next/link";
import { InfoLayout } from "@/components/info-layout";

export const metadata: Metadata = {
  title: "How to play Kadi",
  description:
    "Learn Kadi in plain language: matching cards, special cards, penalties, Niko Kadi and how to win.",
  openGraph: {
    title: "How to play Kadi",
    description:
      "A simple guide to Kadi rules, special cards, penalties and winning.",
    images: [{ url: "/opengraph-image", alt: "How to play Kadi card game" }],
  },
};

const faqs = [
  {
    question: "How many people can play, and how many cards do we get?",
    answer:
      "Kadi is for 2 to 6 players. Everyone starts with 4 cards. The game uses a 52-card deck and 2 jokers.",
  },
  {
    question: "What can I play on my turn?",
    answer:
      "Usually, play a card that matches the top discard by suit or rank. You can also play a group of cards with the same rank if the first card is playable. Queens and eights have their own suit-and-chain rule.",
  },
  {
    question: "What happens when someone plays a 2, 3 or Joker?",
    answer:
      "The next player faces a penalty of 2, 3 or 5 cards. Penalties do not stack: the latest penalty card sets the amount. You can answer only with the allowed penalty cards or an Ace; otherwise, pick up the penalty and end your turn.",
  },
  {
    question: "How do Aces, Kings and Jacks work?",
    answer:
      "An Ace is wild and asks for a suit or number (two Aces ask for a specific card). A King reverses direction. A Jack skips players. Kings and Jacks can be countered during the five-second window.",
  },
  {
    question: "How do I win, and what does Niko Kadi do?",
    answer:
      "Press Niko Kadi during the five-second window after a play when everyone has at least one card. To win, empty your hand with a plain 4, 5, 6, 7, 9 or 10, after calling Niko Kadi. A special card cannot finish the game.",
  },
];

export default function HowToPlayPage() {
  return (
    <InfoLayout
      currentPage="How to play"
      eyebrow="The quick guide"
      title="How to play Kadi"
    >
      <p className="text-lg font-semibold">
        Match a card, watch the special moves, and don’t forget to call Niko
        Kadi before your winning play.
      </p>

      <section aria-labelledby="start-heading">
        <h2 className="text-2xl font-black" id="start-heading">
          Set up the table
        </h2>
        <p>
          Play with 2–6 people. Each player gets 4 cards from a standard deck
          plus two Jokers. The opening card is a random 4, 5, 6, 7, 9 or 10 in
          any suit—never an Ace, 2, 3, 8, Queen, King, Jack or Joker. Play
          starts clockwise.
        </p>
      </section>

      <section aria-labelledby="turn-heading">
        <h2 className="text-2xl font-black" id="turn-heading">
          Make your move
        </h2>
        <p>
          Match the top card by suit or rank. You may lay down two or more cards
          of the same rank together; your first card must be playable, and your
          last card becomes the new top card. If you have no valid move, draw
          one card and end your turn. If you have no cards when your turn comes,
          draw one.
        </p>
        <p>
          A Queen or an 8 must match the top card’s suit and be played with
          another card of that same suit. A chain can continue with a Queen or 8
          matching the previous special card by suit or rank. Finish the chain
          with a card matching the last Queen or 8’s suit. After that, more
          cards of the accompanying card’s rank may follow. The companion can be
          any card in that matching suit.
        </p>
      </section>

      <section aria-labelledby="special-heading">
        <h2 className="text-2xl font-black" id="special-heading">
          Special cards
        </h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>2:</strong> the next player faces a 2-card penalty.
          </li>
          <li>
            <strong>3:</strong> the next player faces a 3-card penalty.
          </li>
          <li>
            <strong>Joker:</strong> can be played at any time and gives a 5-card
            penalty.
          </li>
          <li>
            <strong>Penalty answers:</strong> while facing a penalty, you may
            answer only with a 2, 3, Joker or Ace. A 2 and 3 can answer each
            other only when their suits match; any 2 or 3 can answer the same
            rank, and a Joker answers either. A Joker is answered by another
            Joker. Penalties never add together; the top penalty card decides
            how many cards to pick up.
          </li>
          <li>
            <strong>Ace:</strong> wild. With no penalty, ask for a suit or a
            number; two Aces ask for one exact suit-and-number card. Against a
            penalty, an Ace cancels it and lets you ask for a suit or number.
            The next player must meet the request or draw one card and end their
            turn. The request stays until matched or one full turn rotation
            passes. The next player can cancel a request with their own Ace;
            then play must match that Ace’s suit. A player answering a two-Ace
            request with one Ace lets the original player choose whether to drop
            the requested suit or number. If that answer uses two Aces, both
            parts are cancelled and the suit of the last Ace is required. An Ace
            cannot finish the game.
          </li>
          <li>
            <strong>King:</strong> reverses direction. The next player may
            counter with a King during the five-second window; counters can be
            countered. An even number of Kings played together cancel out.
          </li>
          <li>
            <strong>Jack:</strong> skips the next player. Each skipped player
            may counter with a Jack during the window; counters can be countered
            too.
          </li>
          <li>
            <strong>Two players:</strong> a King or Jack gives the same player
            another turn.
          </li>
        </ul>
      </section>

      <section aria-labelledby="window-heading">
        <h2 className="text-2xl font-black" id="window-heading">
          The five-second window
        </h2>
        <p>
          After each action, everyone sees a five-second countdown. Wait for it
          to end before taking your turn. King and Jack counters, plus the Niko
          Kadi call, happen during this window.
        </p>
      </section>

      <section aria-labelledby="winning-heading">
        <h2 className="text-2xl font-black" id="winning-heading">
          Call it and win
        </h2>
        <p>
          During the window after your play, call Niko Kadi only when every
          player has at least one card. If you call it but cannot win on your
          next turn, you draw one penalty card. Picking up cards cancels your
          call, so you need to call again when eligible.
        </p>
        <p>
          To win, empty your hand with a plain 4, 5, 6, 7, 9 or 10, after
          calling Niko Kadi and while every player had at least one card before
          the play. Ending on a special card or without calling does not win:
          you draw one card on your next turn and keep playing. If the deck is
          empty, the discard pile is reshuffled with its top card left in place.
          If anyone has no cards, they draw one when their turn returns and
          still take part in skips and penalties. Nobody can win until every
          player has at least one card.
        </p>
      </section>

      <section aria-labelledby="rooms-heading">
        <h2 className="text-2xl font-black" id="rooms-heading">
          Rooms and the table
        </h2>
        <p>
          Room codes are one capital letter and four digits. Pick a unique
          in-room name between 2 and 20 characters. The room owner can kick
          players, mute or unmute their chat, end the game, and restart it
          during play or after it ends. If the owner leaves, the earliest
          remaining joiner becomes the owner. A departing or kicked player’s
          cards go to the bottom of the deck. Room chat is cleared when the game
          ends.
        </p>
      </section>

      <section aria-labelledby="faqs-heading">
        <h2 className="text-2xl font-black" id="faqs-heading">
          Five quick FAQs
        </h2>
        <div className="space-y-4">
          {faqs.map((faq) => (
            <details
              className="rounded-2xl border-2 border-black bg-white p-4 shadow-[4px_4px_0_#006600]"
              key={faq.question}
            >
              <summary className="cursor-pointer font-extrabold">
                {faq.question}
              </summary>
              <p className="mt-3">{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <p>
        Ready to play?{" "}
        <Link className="font-extrabold text-[#006600] underline" href="/">
          Create a room or join your crew.
        </Link>
      </p>
    </InfoLayout>
  );
}
