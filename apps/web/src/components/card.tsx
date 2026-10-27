"use client";

import { useId } from "react";

export type CardData = {
  id?: string;
  rank: number | string;
  suit: string | null;
};

const suitShapes: Record<string, string> = {
  hearts:
    "M0 18C-24 0-21-17-8-17C-2-17 0-12 0-9C0-12 2-17 8-17C21-17 24 0 0 18Z",
  diamonds: "M0-19 13 0 0 19-13 0Z",
  clubs:
    "M0 16C-5 22-14 19-14 11C-14 3-7-1-2 3C-11-7-5-17 0-17S11-7 2 3C7-1 14 3 14 11C14 19 5 22 0 16ZM-5 18H5L8 24H-8Z",
  spades:
    "M0-19C12-7 18-1 14 7C11 13 4 13 1 8L5 20H-5L-1 8C-4 13-11 13-14 7C-18-1-12-7 0-19Z",
};

const suitNames: Record<string, string> = {
  clubs: "clubs",
  diamonds: "diamonds",
  hearts: "hearts",
  spades: "spades",
};

const rankNames: Record<string, string> = {
  A: "Ace",
  J: "Jack",
  Q: "Queen",
  K: "King",
  JOKER: "Joker",
};

const pipLayouts: Record<number, Array<[number, number]>> = {
  2: [
    [100, 82],
    [100, 198],
  ],
  3: [
    [100, 68],
    [100, 140],
    [100, 212],
  ],
  4: [
    [70, 78],
    [130, 78],
    [70, 202],
    [130, 202],
  ],
  5: [
    [70, 78],
    [130, 78],
    [100, 140],
    [70, 202],
    [130, 202],
  ],
  6: [
    [70, 70],
    [130, 70],
    [70, 140],
    [130, 140],
    [70, 210],
    [130, 210],
  ],
  7: [
    [70, 70],
    [130, 70],
    [70, 126],
    [130, 126],
    [100, 154],
    [70, 210],
    [130, 210],
  ],
  8: [
    [70, 70],
    [130, 70],
    [70, 126],
    [130, 126],
    [70, 154],
    [130, 154],
    [70, 210],
    [130, 210],
  ],
  9: [
    [70, 65],
    [130, 65],
    [70, 112],
    [130, 112],
    [100, 140],
    [70, 168],
    [130, 168],
    [70, 215],
    [130, 215],
  ],
  10: [
    [70, 65],
    [130, 65],
    [70, 105],
    [130, 105],
    [70, 140],
    [130, 140],
    [70, 175],
    [130, 175],
    [70, 215],
    [130, 215],
  ],
};

export function getCardName(card: CardData) {
  const rank = rankNames[String(card.rank)] ?? String(card.rank);
  return card.suit ? `${rank} of ${suitNames[card.suit] ?? card.suit}` : rank;
}

function Pip({
  suit,
  x,
  y,
  scale = 1,
}: {
  suit: string;
  x: number;
  y: number;
  scale?: number;
}) {
  return (
    <path
      d={suitShapes[suit] ?? suitShapes.spades}
      fill="currentColor"
      transform={`translate(${x} ${y}) scale(${scale})`}
    />
  );
}

export function CardFace({
  card,
  className,
  decorative = false,
  label,
}: {
  card: CardData;
  className?: string;
  decorative?: boolean;
  label?: string;
}) {
  const name = label ?? getCardName(card);
  const suitColor =
    card.suit === "hearts" || card.suit === "diamonds" ? "#BB0000" : "#000000";
  const labelRank = card.rank === "JOKER" ? "★" : String(card.rank);
  const numericRank =
    typeof card.rank === "number"
      ? card.rank
      : /^\d+$/.test(String(card.rank))
        ? Number(card.rank)
        : null;
  const faceRank = ["J", "Q", "K", "A"].includes(String(card.rank));
  const joker = card.rank === "JOKER";

  return (
    <svg
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : name}
      className={`kadi-card-art ${className ?? ""}`}
      role={decorative ? undefined : "img"}
      viewBox="0 0 200 280"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{name}</title>
      <rect
        x="3"
        y="3"
        width="194"
        height="274"
        rx="18"
        fill="#F8F7F1"
        stroke="#006600"
        strokeWidth="6"
      />
      <rect
        x="11"
        y="11"
        width="178"
        height="258"
        rx="13"
        fill="none"
        stroke="#000000"
        strokeOpacity=".12"
        strokeWidth="1.5"
      />
      <g
        fill={suitColor}
        fontFamily="var(--font-display), sans-serif"
        fontWeight="900"
      >
        <text x="23" y="45" fontSize="27">
          {labelRank}
        </text>
        {card.suit && (
          <g transform="translate(24 63) scale(.48)">
            <Pip suit={card.suit} x={0} y={0} />
          </g>
        )}
      </g>
      {numericRank && card.suit && pipLayouts[numericRank] && (
        <g style={{ color: suitColor }}>
          {pipLayouts[numericRank].map(([x, y], index) => (
            <Pip
              key={`${x}-${y}-${index}`}
              scale={numericRank >= 9 ? 0.56 : numericRank >= 7 ? 0.62 : 0.72}
              suit={card.suit!}
              x={x}
              y={y}
            />
          ))}
        </g>
      )}
      {faceRank && (
        <g>
          <rect
            x="46"
            y="57"
            width="108"
            height="166"
            rx="48"
            fill={String(card.rank) === "Q" ? "#BB0000" : "#006600"}
            opacity=".1"
            stroke="#006600"
            strokeWidth="3"
          />
          <path d="M72 201c3-29 15-43 28-43s25 14 28 43" fill="#006600" />
          <circle cx="100" cy="111" r="28" fill={suitColor} />
          <path
            d="M78 108c10-25 35-32 49-12-13-5-25-3-35 7-4 4-9 6-14 5Z"
            fill="#BB0000"
          />
          <text
            fill="#FFFFFF"
            fontFamily="var(--font-display), sans-serif"
            fontSize="30"
            fontWeight="900"
            textAnchor="middle"
            x="100"
            y="146"
          >
            {String(card.rank)}
          </text>
          {card.suit && (
            <g style={{ color: suitColor }}>
              <Pip scale={0.42} suit={card.suit} x={100} y={188} />
            </g>
          )}
        </g>
      )}
      {joker && (
        <g>
          <path
            d="M100 62 121 91 151 84 140 116 159 140 127 149 121 181 100 159 79 181 73 149 41 140 60 116 49 84 79 91Z"
            fill="#006600"
            stroke="#000000"
            strokeLinejoin="round"
            strokeWidth="5"
          />
          <circle cx="83" cy="120" r="6" fill="#FFFFFF" />
          <circle cx="117" cy="120" r="6" fill="#FFFFFF" />
          <path
            d="M84 139q16 14 32 0"
            fill="none"
            stroke="#FFFFFF"
            strokeLinecap="round"
            strokeWidth="5"
          />
          <text
            fill="#BB0000"
            fontFamily="var(--font-display), sans-serif"
            fontSize="18"
            fontWeight="900"
            textAnchor="middle"
            x="100"
            y="222"
          >
            JOKER
          </text>
        </g>
      )}
      <g
        fill={suitColor}
        fontFamily="var(--font-display), sans-serif"
        fontWeight="900"
        transform="rotate(180 100 140)"
      >
        <text x="23" y="45" fontSize="27">
          {labelRank}
        </text>
        {card.suit && (
          <g transform="translate(24 63) scale(.48)">
            <Pip suit={card.suit} x={0} y={0} />
          </g>
        )}
      </g>
    </svg>
  );
}

export function CardBack({
  className,
  decorative = false,
}: {
  className?: string;
  decorative?: boolean;
}) {
  const patternId = `kadi-card-dots-${useId().replaceAll(":", "")}`;
  return (
    <svg
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : "Face-down card"}
      className={`kadi-card-art ${className ?? ""}`}
      role={decorative ? undefined : "img"}
      viewBox="0 0 200 280"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Face-down card</title>
      <defs>
        <pattern
          height="8"
          id={patternId}
          patternUnits="userSpaceOnUse"
          width="8"
        >
          <circle cx="2" cy="2" r="1.5" fill="#FFFFFF" opacity=".55" />
        </pattern>
      </defs>
      <rect
        x="3"
        y="3"
        width="194"
        height="274"
        rx="18"
        fill="#006600"
        stroke="#000000"
        strokeWidth="6"
      />
      <rect
        x="13"
        y="13"
        width="174"
        height="254"
        rx="13"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="3"
      />
      <path
        d="M15 65 88 15h42L15 110Zm170 105-75 95H68l117-148Z"
        fill="#BB0000"
      />
      <path
        d="M15 65 88 15h42L15 110Zm170 105-75 95H68l117-148Z"
        fill={`url(#${patternId})`}
      />
      <circle
        cx="100"
        cy="140"
        r="63"
        fill="#FFFFFF"
        stroke="#000000"
        strokeWidth="8"
      />
      <circle cx="100" cy="140" r="54" fill={`url(#${patternId})`} />
      <text
        fill="#BB0000"
        fontFamily="var(--font-display), sans-serif"
        fontSize="49"
        fontWeight="900"
        paintOrder="stroke"
        stroke="#000000"
        strokeLinejoin="round"
        strokeWidth="9"
        textAnchor="middle"
        x="102"
        y="156"
      >
        Kadi
      </text>
      <text
        fill="#FFFFFF"
        fontFamily="var(--font-display), sans-serif"
        fontSize="13"
        fontWeight="900"
        letterSpacing="3"
        textAnchor="middle"
        x="100"
        y="220"
      >
        PLAY YOUR HAND
      </text>
      <path
        d="m42 44 9 17 18 3-13 12 3 18-17-9-16 9 3-18-14-12 19-3Z"
        fill="#FFFFFF"
      />
      <path
        d="m158 184 9 17 18 3-13 12 3 18-17-9-16 9 3-18-14-12 19-3Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

export function Card({
  card,
  faceDown = false,
  selected = false,
  disabled = false,
  onClick,
  label,
  className,
}: {
  card: CardData;
  faceDown?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  label?: string;
  className?: string;
}) {
  const artwork = faceDown ? (
    <CardBack decorative />
  ) : (
    <CardFace card={card} decorative />
  );
  const baseClass = `kadi-card ${selected ? "kadi-card-selected" : ""} ${disabled ? "kadi-card-disabled" : ""} ${className ?? ""}`;

  if (onClick) {
    return (
      <button
        aria-label={label ?? (faceDown ? "Face-down card" : getCardName(card))}
        aria-pressed={selected}
        className={baseClass}
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        {artwork}
      </button>
    );
  }

  return (
    <div
      aria-label={label ?? (faceDown ? "Face-down card" : getCardName(card))}
      className={baseClass}
      role="img"
    >
      {artwork}
    </div>
  );
}
