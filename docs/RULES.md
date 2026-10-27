SETUP
- 52 cards plus 2 jokers. 2 to 6 players. Each player is dealt 4 cards.
- The starting card is picked at random from ranks 4, 5, 6, 7, 9, 10 (any suit). It is never an Ace, 2, 3, 8, Q, K, J or Joker.
- Direction starts clockwise.

PLAYING CARDS
- A card must match the top card by rank or suit.
- A player may play 2 or more cards in one turn if they share the same rank. The first card must be playable on the top card. The last card played becomes the new top card.
- Q and 8: the Q or 8 must match the SUIT of the top card, and must be played with an accompanying card of the same suit as the Q or 8. Chains: consecutive Q/8 cards must match by suit (Q-hearts then 8-hearts) or by rank (Q-hearts then Q-spades). The chain ends with an accompanying card matching the suit of the LAST Q/8 in the chain. After that, more cards of the accompanying card's rank may follow. ASSUMPTION (flag in code comments): the accompanying card may be any card of that suit.

PENALTIES
- A 2 makes the next player pick 2 cards. A 3 makes them pick 3. A Joker makes them pick 5.
- Penalties never accumulate: the amount is always that of the top-most penalty card.
- A player facing a penalty may ONLY answer with: a 2, a 3, a Joker or an Ace. Otherwise they pick up the penalty amount and their turn ends.
- A 2 can be answered by any 2, a Joker, or a 3 of the same suit as the 2.
- A 3 can be answered by any 3, a Joker, or a 2 of the same suit as the 3.
- A Joker can be answered by another Joker. A Joker can be played at any time.
- An answered penalty passes to the next player at the amount of the new top-most penalty card.

ACE
- Ace is a wild card. A player may play at most 2 Aces in one play.
- Ace against a penalty: it cancels the penalty, and the Ace player then asks for a suit or a number.
- Ace with no penalty: the Ace player asks for a suit or a number. With 2 Aces they ask for a specific card (suit AND number).
- The request binds the next player(s): they must match it or draw 1 card (turn ends). It stays in force until someone matches it, or until it has gone one full rotation back to the Ace player.
- Cancelling a request: the next player can play an Ace of their own. Play then continues with a card matching the SUIT of that cancelling Ace.
- If player A played 2 Aces and player B answers with one Ace, player A decides which part of the request to forgo (the suit or the number); the other part stays in force. If player C then plays another Ace, the cancelling rule above applies. ASSUMPTION: if B answers with two Aces, both requests are cancelled and play continues matching the suit of B's last Ace.
- An Ace can never be a finishing card.

KING
- Reverses direction. The next player may counter with their own King within the 5-second window, reversing it back. Counters can be countered again. An even number of Kings in one play cancels out.

JACK
- Skips the next player. N Jacks in one play skip N players.
- A skipped player may refuse by playing their own Jack within the 5-second window; the skip then passes to the following player. Counters can be countered again. ASSUMPTION: with several Jacks, each skipped player in turn may counter.

TWO-PLAYER GAMES
- A King or a Jack means the same player plays again.

THE 5-SECOND WINDOW
- After EVERY action (play, draw, penalty pickup, Ace) the server opens a 5-second window before the next player can act. It is shown to everyone as a countdown. All players must wait it out. King/Jack counters and the niko kadi button are used in this window. The server owns the timer; clients only render a countdown from a server deadline.

DRAWING
- A player with no valid card draws 1 card from the deck and their turn ends.
- A player with 0 cards draws 1 card when their turn comes.
- If the deck runs out, reshuffle the discard pile (keeping the top card) into a new deck.

NIKO KADI AND WINNING
- After playing, within the 5-second window, a player may press Niko Kadi to signal they are about to finish. It can only be pressed if every player has at least 1 card.
- If a player pressed it but cannot win on their next turn, they draw 1 penalty card at that turn.
- If a player picks up cards after pressing it, it is cancelled; they must press it again once they can win.
- A player wins only when ALL of these hold: they empty their hand; the final card played is a plain number card (4, 5, 6, 7, 9 or 10, never 2, 3, 8, Q, K, J, Joker or Ace); they had pressed Niko Kadi; every player (including them before the play) had at least 1 card.
- If a player empties their hand any other way (e.g. a special card is last, or no Niko Kadi), the game continues. They have 0 cards, draw 1 on their next turn, and still take part in penalties and skips. Nobody can win until every player has at least 1 card.

ROOMS
- Room code format: one capital letter followed by 4 digits (e.g. K4821).
- Players use their own name or one of their choosing (2 to 20 chars, unique within the room).
- The room owner (creator) can kick players, mute anyone in chat, end the game, restart the game mid-play, and restart after a game has ended. ASSUMPTION: if the owner leaves, ownership passes to the player who joined earliest. A kicked or departed player's cards go to the bottom of the deck.
- Group chat messages are deleted when the game ends.
