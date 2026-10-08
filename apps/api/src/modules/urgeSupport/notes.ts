/**
 * Short notes emailed when the user opens the breathing exercise during an urge. Each
 * comes from a different angle so they never feel like the same message twice. Written to
 * be read in under a minute, ending with one small thing to do right now.
 *
 * Kept discreet: no explicit words, nothing that would embarrass on a lock screen.
 */

export type NoteKind = 'psychology' | 'identity' | 'motivation' | 'compassion' | 'perspective';

export interface UrgeNote {
  kind: NoteKind;
  title: string;
  paragraphs: string[];
  /** One small action for the next few minutes. */
  action: string;
}

export const KIND_LABEL: Record<NoteKind, string> = {
  psychology: 'How your mind works',
  identity: 'Who you are becoming',
  motivation: 'Why it matters',
  compassion: 'Be kind to yourself',
  perspective: 'Zoom out',
};

export const NOTES: UrgeNote[] = [
  {
    kind: 'psychology',
    title: "It's a wave, not a wall",
    paragraphs: [
      "An urge feels like it will keep growing until you give in. It won't. Urges behave like waves: they rise, they peak, and they fall, usually within 15 to 20 minutes, as long as you don't feed them.",
      "Psychologists call this urge surfing. You don't have to fight the wave or obey it. You only have to stay on the board until it passes.",
    ],
    action: 'Notice where you feel it in your body right now (chest, stomach, hands) and say quietly: "This is an urge. It will pass."',
  },
  {
    kind: 'psychology',
    title: 'Your brain is making a prediction, not a promise',
    paragraphs: [
      "The pull you feel is dopamine, and dopamine is about anticipation, not satisfaction. Your brain is forecasting a reward. Forecasts are often wrong.",
      "Think honestly about how you felt ten minutes after the last time you gave in. The craving promised relief; what it delivered was usually emptiness, tiredness, or regret.",
    ],
    action: 'Recall that "ten minutes after" feeling as clearly as you can. Let it sit next to the craving.',
  },
  {
    kind: 'identity',
    title: 'Cast one vote',
    paragraphs: [
      'Every action you take is a vote for the type of person you wish to become. You do not need a perfect record. You need a majority.',
      'Right now you have the chance to cast one clear vote. Not for forever. Just this one.',
    ],
    action: 'Say it out loud, even in a whisper: "I am someone who lets urges pass."',
  },
  {
    kind: 'psychology',
    title: 'HALT: what do you actually need?',
    paragraphs: [
      'Urges often show up wearing a disguise. Underneath, there is usually a simpler need: being Hungry, Angry, Lonely, or Tired.',
      'The urge is a signal, not an instruction. When you meet the real need, the signal often goes quiet on its own.',
    ],
    action: 'Ask which of the four it is. Then meet that need: eat something, drink water, message a friend, or lie down and rest.',
  },
  {
    kind: 'motivation',
    title: 'Tomorrow morning is watching',
    paragraphs: [
      "Picture yourself waking up tomorrow. That person will either carry the weight of tonight or the quiet pride of it.",
      'You are the only one who can give them that pride. It is fifteen minutes of discomfort away.',
    ],
    action: 'Write one sentence to tomorrow-you, in your notes or on paper. Tell them what you chose.',
  },
  {
    kind: 'compassion',
    title: "You're not broken",
    paragraphs: [
      'Having urges is human. It is not a verdict on who you are. The fact that you opened this, right now, means part of you is already choosing differently.',
      'Shame keeps the cycle going. Kindness is what breaks it. You can be gentle with yourself and still say no.',
    ],
    action: 'Put a hand on your chest, take one slow breath, and tell yourself: "This is hard, and I can do hard things."',
  },
  {
    kind: 'perspective',
    title: 'Twenty minutes from now',
    paragraphs: [
      'In twenty minutes, this moment will be a memory. The only question is which memory: one you would rather forget, or one you are quietly proud of.',
      'Think of a time you stayed strong before. Remember how good that felt afterwards. That feeling is available again.',
    ],
    action: 'Change where you are. Walk to another room, step outside, or stand by a window.',
  },
  {
    kind: 'psychology',
    title: 'Change the scene, change the urge',
    paragraphs: [
      'Willpower is unreliable. Environment is powerful. Urges are tied to cues: the same place, the same time, the same screen.',
      'Break one link in that chain and the whole thing weakens. You do not have to be stronger than the urge, only smarter than the setup.',
    ],
    action: 'Put your phone in another room for fifteen minutes, or go somewhere other people are.',
  },
  {
    kind: 'identity',
    title: 'You are rewiring, right now',
    paragraphs: [
      'Neurons that fire together wire together. Every time you follow an urge, that pathway gets stronger. Every time you let one pass, it gets a little weaker.',
      'This moment is not just about today. You are physically reshaping your brain toward the person you want to be.',
    ],
    action: 'Do something physical for two minutes: twenty push-ups, squats, or a fast walk.',
  },
  {
    kind: 'motivation',
    title: 'Remember your why',
    paragraphs: [
      'You started tracking this for a reason. Maybe it was your energy, your focus, your relationships, or simply your self-respect.',
      'Urges are loud, but they are short-sighted. Your reasons are quieter, and they last.',
    ],
    action: 'Name three things or people you are doing this for. Say them out loud.',
  },
  {
    kind: 'psychology',
    title: "Don't fight it. Watch it.",
    paragraphs: [
      'Try not to think of a white bear. You just did. Pushing a thought away makes it louder; that is how the mind works.',
      'Instead, watch the urge like a cloud passing across the sky. You can see it without climbing on it.',
    ],
    action: 'For ten breaths, label each thought "thinking" and gently bring your attention back to the breath.',
  },
  {
    kind: 'compassion',
    title: 'Just the next ten minutes',
    paragraphs: [
      'You do not have to promise yourself forever. Forever is too heavy to carry in a moment like this.',
      'All you have to do is get through the next ten minutes. Then, if you need to, the next ten.',
    ],
    action: 'Set a ten-minute timer and do something with your hands: wash dishes, tidy a shelf, draw, cook.',
  },
  {
    kind: 'identity',
    title: "You've done this before",
    paragraphs: [
      'Look back at your tracker. There are times you let the urge pass. That was not luck, and it was not someone else. It was you.',
      'The person who did that is the same person reading this now, with the same strength.',
    ],
    action: 'Open your urge history and look at one time you diverted. Remember how it felt.',
  },
  {
    kind: 'perspective',
    title: 'The honest trade',
    paragraphs: [
      'On one side: a few minutes of relief. On the other: your energy tomorrow, your focus, your mood, and the trust you are building with yourself.',
      'When you see the whole trade, it is not as tempting as it first looked.',
    ],
    action: 'Write down the trade in two columns: what you get and what it costs. Look at it for thirty seconds.',
  },
  {
    kind: 'psychology',
    title: 'Cold water, calm body',
    paragraphs: [
      'When cold water touches your face, your body triggers the dive reflex: your heart rate slows and your nervous system shifts toward calm. It is one of the fastest physical resets you have.',
      'Urges live in the body as much as the mind. Calm the body and the mind follows.',
    ],
    action: 'Splash cold water on your face for thirty seconds, or hold something cold. Then breathe out slowly.',
  },
  {
    kind: 'motivation',
    title: 'This energy is fuel',
    paragraphs: [
      'What you are feeling is energy. Raw and restless, but energy. It does not have to go where it usually goes.',
      'Some of the best workouts, ideas and work come from exactly this kind of restlessness, pointed somewhere better.',
    ],
    action: 'Pick one: a workout, a creative task, cleaning one space, or learning something for fifteen minutes. Start now.',
  },
  {
    kind: 'compassion',
    title: 'If a friend sent you this',
    paragraphs: [
      'Imagine a close friend messaged you: "I am struggling with an urge right now." You would not judge them. You would tell them they can get through it, and that you believe in them.',
      'You deserve to hear the same thing from yourself.',
    ],
    action: 'Write yourself the message you would send that friend. Then read it slowly.',
  },
  {
    kind: 'psychology',
    title: 'Delay, not deny',
    paragraphs: [
      'Saying "never" makes the mind rebel. Saying "not now" is easier to accept.',
      'Tell yourself you will decide in fifteen minutes. Urges rarely survive a delay; by the time you come back to it, the wave has usually passed.',
    ],
    action: 'Say: "Not now. I will decide in fifteen minutes." Then do something else until the timer ends.',
  },
  {
    kind: 'identity',
    title: 'You have urges. You are not your urges.',
    paragraphs: [
      'Thoughts and feelings are visitors. They knock, they come in, and they leave. They do not get to decide who you are.',
      'The one who notices the urge is not the urge. That observer, calm and steady, is the real you.',
    ],
    action: 'Step back and describe the urge in the third person: "There is a strong pull right now." Notice the distance that creates.',
  },
  {
    kind: 'perspective',
    title: 'One percent',
    paragraphs: [
      'Get one percent better every day and in a year you are about 37 times better. Small wins compound into a different life.',
      'This moment, right here, is your one percent today.',
    ],
    action: 'Win this small moment. Then log it in your tracker as a diverted urge.',
  },
  {
    kind: 'psychology',
    title: 'Boredom is looking for stimulation',
    paragraphs: [
      'Often an urge is just a bored brain hunting for something intense. It does not need that specific thing. It needs something.',
      'Give it a better kind of stimulation and it will usually take it.',
    ],
    action: 'Call someone, put on music you love, cook something, or go for a walk with a podcast.',
  },
  {
    kind: 'motivation',
    title: 'The morning after',
    paragraphs: [
      'Picture tomorrow: waking up clear-headed, rested, a little proud, with nothing to hide from yourself.',
      'That feeling is not far away. It is on the other side of the next few minutes.',
    ],
    action: 'Close your eyes for one minute and really picture that morning. Then open them and do one useful thing.',
  },
  {
    kind: 'compassion',
    title: 'Progress, not perfection',
    paragraphs: [
      'Maybe you slipped before. That does not cancel anything. Missing once is an accident; what matters is not missing twice.',
      'Today is a fresh vote, no matter what happened yesterday.',
    ],
    action: 'Forgive yesterday in one sentence. Then focus only on the next ten minutes.',
  },
  {
    kind: 'psychology',
    title: 'Name it to tame it',
    paragraphs: [
      'Research on affect labeling shows that simply putting a feeling into words lowers its intensity. Naming it moves activity away from the alarm centres of the brain.',
      'What happened just before this? Stress, scrolling, being alone, feeling low?',
    ],
    action: 'Name the trigger and the feeling in one line, like "Stressed after work, feeling lonely." Write it in your tracker.',
  },
  {
    kind: 'identity',
    title: 'Act as if',
    paragraphs: [
      'Imagine the calm, disciplined version of you, the one you are working towards. How would they spend the next ten minutes?',
      'You do not have to feel like that person yet. You only have to act like them for a little while.',
    ],
    action: 'Do exactly what that version of you would do next. Start it within the next minute.',
  },
  {
    kind: 'perspective',
    title: 'Look up and look far',
    paragraphs: [
      'When you are locked onto a screen, your vision narrows and so does your attention. Looking at a wide view, the sky or the horizon, helps your nervous system settle.',
      'The world is bigger than this moment.',
    ],
    action: 'Go outside or to a window. Look at the farthest thing you can see for one full minute.',
  },
  {
    kind: 'motivation',
    title: 'You already started',
    paragraphs: [
      'Opening this was a choice. You are already doing it: you paused, you reached for help instead of the urge.',
      'That is the hardest part. Keep going.',
    ],
    action: 'Finish the breathing exercise, then stand up and move to a different room.',
  },
  {
    kind: 'compassion',
    title: 'Coach, not critic',
    paragraphs: [
      'The voice in your head can sound like a harsh critic or a good coach. The critic makes you feel small, and feeling small makes urges louder.',
      'A coach is firm but warm: "This is tough. You have trained for this. Let\'s go."',
    ],
    action: 'Say to yourself what a good coach would say right now. Use your own name.',
  },
  {
    kind: 'psychology',
    title: 'Move it out of your body',
    paragraphs: [
      'Urges come with restlessness and adrenaline. Exercise burns through that and releases endorphins, your natural calm.',
      'Even two minutes of movement can noticeably lower the intensity.',
    ],
    action: 'Do thirty jumping jacks, climb a flight of stairs twice, or hold a plank for as long as you can.',
  },
  {
    kind: 'identity',
    title: 'A line in your story',
    paragraphs: [
      'A year from now, you might tell someone how you changed. Moments like this one are what that story is made of.',
      'Not the big dramatic days. The quiet evenings when you chose differently, and no one saw but you.',
    ],
    action: 'Decide how you want this moment to read in your story. Then make it read that way.',
  },
];

/** Deterministic shuffle (mulberry32 seeded from a string). */
function seededOrder(seed: string, n: number): number[] {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

/**
 * The note for a user's `sent`-th request (0-based). Every note is used once before any
 * repeats; each round has its own order, and a round never starts with the note that
 * ended the previous one.
 */
export function pickNote(userId: string, sent: number): { index: number; note: UrgeNote } {
  const n = NOTES.length;
  const round = Math.floor(sent / n);
  const order = seededOrder(`${userId}:${round}`, n);
  if (round > 0) {
    const prevLast = seededOrder(`${userId}:${round - 1}`, n)[n - 1];
    if (order[0] === prevLast) [order[0], order[1]] = [order[1]!, order[0]!];
  }
  const index = order[sent % n]!;
  return { index, note: NOTES[index]! };
}
