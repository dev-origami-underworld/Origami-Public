/**
 * Mini-Game Engine
 * Handles logic for in-game gambling (Dice, Cards).
 */

export class GameEngine {
  constructor(dm) {
    this.dm = dm;
  }

  playDice(betAmount) {
    const playerRoll = this.rollDice(2);
    const houseRoll = this.rollDice(2);
    
    let result = {
      playerRoll,
      houseRoll,
      won: playerRoll > houseRoll,
      tie: playerRoll === houseRoll,
      payout: 0
    };

    if (result.won) {
      result.payout = betAmount * 2;
    } else if (result.tie) {
      result.payout = betAmount; // Push
    }

    return result;
  }

  playCards(betAmount) {
    // Simple High Card logic for now
    const deck = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
    const playerCard = this.drawCard(deck);
    const houseCard = this.drawCard(deck);
    
    const playerVal = this.getCardValue(playerCard);
    const houseVal = this.getCardValue(houseCard);

    return {
      playerCard,
      houseCard,
      won: playerVal > houseVal,
      tie: playerVal === houseVal,
      payout: playerVal > houseVal ? betAmount * 2 : 0
    };
  }

  rollDice(count) {
    let total = 0;
    for (let i = 0; i < count; i++) {
      total += Math.floor(Math.random() * 6) + 1;
    }
    return total;
  }

  drawCard(deck) {
    return deck[Math.floor(Math.random() * deck.length)];
  }

  getCardValue(card) {
    if (["J", "Q", "K"].includes(card)) return 10;
    if (card === "A") return 11;
    return parseInt(card);
  }
}
