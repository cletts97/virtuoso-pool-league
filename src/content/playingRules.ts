// Concise reference to the EPA-hosted WEPF World Rules poster (abridged January 2020).
// Playing-rule summaries only; competition scoring remains in domain/rules.ts.
export const ruleSections = [
  {
    id: 'starting',
    title: 'Starting the game',
    items: [
      'The game is played with 7 reds, 7 yellows, a black and a white cue ball.',
      'Break from behind the baulk line.',
      'A fair break needs a colour potted or at least four object balls reaching a cushion. Otherwise, re-rack: the opponent breaks with two visits.',
      'If the black is potted on the break, re-rack and the same player breaks again.',
      'If the white falls on an otherwise fair break, the opponent takes one visit from baulk.',
      'If a colour falls on a fair break without a foul, announce your group. A group potted on the break is yours immediately; otherwise, pot your nominated group on the next shot to claim it. On an open table after the break, a legal colour pot decides your group; nominate if both colours fall.',
    ],
  },
  {
    id: 'normal-play',
    title: 'Normal play',
    items: [
      'On an open table, either colour may be played. Once groups are decided, first contact must be with a ball on: your colour, the black when your group is cleared, or a valid foul-snooker nomination. Playing away from a touching ball on is an exception.',
      'After legal first contact, pot a ball on or make any ball, including the white, reach a cushion. The break and a confirmed total snooker have separate requirements.',
      'Legal pots of a ball on continue your visit; this includes a valid foul-snooker nomination.',
      "If you don't pot a ball but make a legal shot, your turn ends.",
      "Potting an opponent's ball is normally a foul, even after hitting your colour first. A properly nominated foul-snooker or foul-jaw-snooker ball is an exception.",
      'Your colour group must be cleared before you try to pot the black.',
    ],
  },
  {
    id: 'fouls',
    title: 'Fouls — two visits to your opponent',
    introduction: 'The following are standard fouls:',
    items: [
      'Potting the white, except for the different fair-break penalty.',
      'First contact with a ball that is not on, unless a valid nomination makes it on.',
      'Missing every ball without a touching-ball exception.',
      'Missing the pot/cushion requirement, unless confirmed total-snooker relief applies.',
      "Potting an opponent's ball without a valid foul-snooker nomination.",
      'Touching balls with your body, clothing or cue when not permitted.',
      'Playing a push shot or double hit.',
      'Taking a shot with neither foot touching the floor.',
      'A ball finishing off the playing surface.',
      'Playing out of turn.',
    ],
  },
  {
    id: 'after-a-foul',
    title: 'What happens after a foul?',
    items: [
      'Your opponent receives two visits for a standard foul.',
      'If the white was potted, your opponent plays from behind the baulk line.',
      'Otherwise, play from where the white rests, unless a foul-snooker ruling permits baulk.',
      'The first visit ends when you fail to legally pot a ball.',
      'You then begin your second visit.',
      'A foul during either visit ends your turn and gives your opponent the appropriate foul penalty.',
    ],
  },
  {
    id: 'baulk',
    title: 'Playing from behind the line',
    items: [
      'The centre of the white must be behind the baulk line.',
      'The white can be positioned anywhere within baulk.',
      'Under official World Rules, you can shoot in any direction.',
      'You cannot place the white beyond the baulk line.',
    ],
  },
  {
    id: 'snookers',
    title: 'Snookers',
    items: [
      'Deliberate snookers are allowed. A total snooker means no part of any ball on can be hit directly.',
      "A normal snooker does not allow you to hit an opponent's ball first.",
      'If a foul leaves you snookered, ask for a ruling before using foul-snooker options. Moving to baulk requires the snooker to be checked again.',
      'A valid nomination makes an opponent’s ball or the black a ball on for the first shot only. Pot the nominated black only when your group is already cleared.',
      'After a confirmed total snooker, first contact must still be with a ball on; no pot or cushion is required.',
    ],
  },
  {
    id: 'winning',
    title: 'Winning and losing',
    introduction:
      'Win by clearing your colour group, then legally potting the black on a separate shot.',
    listLabel: 'You lose immediately if:',
    items: [
      'You pot the black while your group is not cleared, except on the break.',
      'You pot your final colour and the black together, except on the break.',
      'You pot the black and white together, except on the break.',
      'You foul while potting the black, except for the re-rack rule on the break.',
      'You deliberately interfere with balls or commit another loss-of-frame offence.',
    ],
  },
  {
    id: 'general',
    title: 'General rules',
    items: [
      'Only one foot needs to touch the floor when taking a shot; both feet are not required.',
      'Wait for all balls to stop moving before taking your next shot.',
      'Do not touch balls with your hands, clothing or cue except where permitted.',
      'Accidental fouls still count.',
      'Unsporting behaviour is not permitted.',
    ],
  },
];

export const ruleReminders = [
  {
    title: "Potting an opponent's ball",
    text: "Potting an opponent's ball is normally a foul. A properly nominated foul-snooker ball is an exception.",
  },
  {
    title: 'Cushion rule',
    text: 'After legal first contact, pot a ball on or send any ball (including the white) to a cushion. Confirmed total snookers are exempt.',
  },
  {
    title: 'Foul snooker',
    text: 'For a confirmed foul snooker, nominate an opponent’s ball or the black for the first shot only. Pot the black only if your colours are cleared.',
  },
  {
    title: 'Playing from baulk',
    text: 'You can shoot in any direction, including backwards, when playing from behind the baulk line.',
  },
];
