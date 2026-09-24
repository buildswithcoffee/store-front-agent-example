import { experimental_evaluate as evaluate } from 'ai';

// Edit the questions here — everything else in this app just pipes text in and JSON out.
export async function runJev(text: string) {
  const result = await evaluate({
    model: 'typesafe-ai/jev',
    state: text,
    questions: {
      refunded: {
        type: 'boolean',
        instructions: 'Was a refund issued to the customer?',
        criteria: {
          true: 'The agent confirmed that money was returned to the customer.',
          false: 'No refund was issued, or the refund was declined.',
        },
      },
    },
  });

  return result.answers;
}
