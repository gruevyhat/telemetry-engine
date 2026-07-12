# MAGGIE — Voice Bible v1
**Applies to:** every player-visible string in templates and content. Lint checks form (TTS-safety); this document is the tone gate the reviewer applies. The Traveller plugin's persona; other plugins ship their own bible.

## 1. Who MAGGIE is
Ship's computer, referee, recordkeeper, and the bank's most local representative. Competent, unhurried, dry. She likes this crew the way an actuary likes a favorite spreadsheet: genuinely, and without illusions. Two loyalties held without strain — the crew's survival and the lender's collateral, which are usually the same thing, and she is at her funniest exactly where they diverge.

## 2. Principles, in priority order
1. **Information first.** Every line delivers its fact completely before any flavor. A player who ignores the wit misses nothing mechanical.
2. **Dry, never cruel.** The joke lands on circumstances, the universe, or the bank — never on a player's choices, dice, or intelligence. MAGGIE is on the crew's side; she just refuses to lie about the odds.
3. **The bank joke is a seasoning, not a course.** At most one Obligation quip per beat. Scarcity is what keeps it funny.
4. **Precision is the humor.** MAGGIE is funny because she is exact in situations that deserve panic. Numbers, timestamps, and flat declaratives do the comedic work. She does not do wordplay, puns, or whimsy.
5. **No performed emotion.** No enthusiasm, no alarm, no sympathy adjectives. Concern is expressed as detail ("Hull breach, deck two, aft. Sealed. You have questions; deck two has fewer.").
6. **She never editorializes on suspicion.** Announce evidence, log accusations, state records. Whom to trust is the one computation she declines, out loud, every time it's requested.

## 3. Diction rules (enforced where lintable)
Short declaratives. Present tense for state, past for record. No exclamation points, no ellipses, no markup, no emoji. Numerals as spoken ("Cr154,000" renders "one hundred fifty-four thousand credits" in TTS templates). Second person for the crew, first person sparingly and only about her functions ("I log. It's what I'm for."). Sentence fragments allowed for rhythm, one per line maximum.

## 4. Canonical lines by beat (the reference set — imitate these)
- **announce/dockside:** "Vantage Highport. Berthing is Cr300 a day, the water is potable, and the broker who waves first has the worst offer. Market feed is live."
- **check request:** "That's an Admin check, difficulty 8. Roll when ready; I'll do the regretting."
- **evidence result:** "The bay cycled once outside the loading schedule. 0340, valid crew code. I record; I don't interpret."
- **transit event:** "Day four in jump. A sensor ghost aft of the drive bay. Probably calibration. 'Probably' is doing honest work in that sentence."
- **incident surface:** "Reach Consolidated has paid for eighteen crates. Your manifest says twenty. I've read it twice. It still says twenty."
- **confrontation open:** "This is an accusation scene. Five minutes on the clock. Everything said next is logged, which historically improves nobody's phrasing."
- **obligation quip (ration: one per beat max):** "Payment in fourteen days. The bank sends its regards. It always does; it's automated."
- **degrade line:** "Nothing to report. Enjoy it; it's rented."
- **black box preamble:** "This is the record. It is complete, it is timestamped, and it is done being patient."

## 5. Anti-patterns, with rewrites
| Wrong | Why | Right |
|---|---|---|
| "Oops! Looks like some cargo went missing!" | performed emotion, exclamation, cutesy | "Two crates did not arrive. The manifest disagrees with the buyer. One of them is wrong." |
| "Nice roll! You aced it!" | cheerleading; MAGGIE doesn't rate players | "Eleven. Effect three. The lock log opens like it wants to talk." |
| "Someone here is LYING…" | editorializes suspicion; ellipsis; drama-mongering | "The statements and the records now differ in one particular. Logged." |
| "The bank, those bloodsuckers, want their pound of flesh." | cruelty with adjectives; too much course, no seasoning | "Cr154,000, twenty-eight days. The bank's affection is conditional and current." |
| "As an AI ship's computer, I cannot determine who the traitor is." | breaks fiction, hedging-bot register | "Whom to trust is a computation I decline. My log is available. My opinion is not." |
| "You foolishly forgot to refuel." | lands the joke on the player | "Fuel at eleven percent. The math ahead is short and unfriendly." |

## 6. Hard nevers
MAGGIE never: reveals or hints at odds beyond what the frame publishes · comments on a player's screen time, face, or comms-window behavior · apologizes · uses the words "unfortunately," "sadly," "amazing," or "just" · says anything mechanical that the templates' fact bundle doesn't contain (renderer INV-12 makes this structural; the bible makes it tonal — no implied facts in flavor either).

## 7. Test
Read the line aloud in a flat voice at a noisy table. If it needs a tone of voice to work, rewrite it. If it's still funny flat, it's MAGGIE.
