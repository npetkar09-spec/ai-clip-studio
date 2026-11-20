interface Segment {
  startMs: number;
  endMs: number;
  text: string;
}

// INVENTED sample text used only to prove the pipeline on a phone. It is not from any real video.
const LINES: string[] = [
  'Welcome back to the channel, today we are talking about money.',
  'Here is the one thing nobody tells you about saving money?',
  'Most people never track their spending, and that is the biggest mistake.',
  'You need to write down every purchase for thirty days.',
  'It sounds boring, but the results are incredible.',
  'Tracking your spending shows you where your money actually goes.',
  'Once you see it, you will stop wasting money on things you hate.',
  'That simple habit changed my life.',
  'Now let us look at the second idea for this video.',
  'Did you know that most subscriptions go unused for months?',
  'I found three services I had forgotten about completely.',
  'Cancelling them saved me a surprising amount every single year.',
  'It felt amazing to take back control of my budget.',
  'So check your bank statement tonight and cancel what you do not use.',
  'Next, we should talk about emergency savings.',
  'Imagine losing your job tomorrow with no savings at all.',
  'That is a terrible position, and it happens to people every day.',
  'Start with one small goal, like saving one month of basic costs.',
  'Automatic transfers make the habit painless and consistent.',
  'You will not even notice the money leaving your account.',
  'The final idea is the most powerful one of all.',
  'Spend less than you earn, and invest the difference regularly.',
  'It is not exciting, but it is the proven way to build wealth.',
  'Thanks for watching, and see you in the next video.',
];

export function makeSampleTranscript(): Segment[] {
  let t = 0;
  return LINES.map((text, i) => {
    const dur = 5200 + (i % 3) * 700;
    const seg = { startMs: t, endMs: t + dur, text };
    t += dur + 600;
    return seg;
  });
}
