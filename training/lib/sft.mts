import { MOVE_PROMPT, PROMPT } from '../../apps/extension/src/analysis/ollama.ts';
import { targetsFor, type Labels } from './labels.mts';

/**
 * Supervised fine-tuning records in the multimodal chat-message layout used by Hugging Face
 * chat templates and Unsloth's vision fine-tuning: user turn = image + the extension's exact
 * prompt, assistant turn = the exact JSON the extension parses. One example gives two records,
 * one per question the extension asks. Verify the layout against the tooling version before training.
 */
export type SftRecord = {
  id: string;
  messages: [
    { role: 'user'; content: [{ type: 'image'; image: string }, { type: 'text'; text: string }] },
    { role: 'assistant'; content: [{ type: 'text'; text: string }] },
  ];
};

export function sftRecords(id: string, labels: Labels, images: { chart: string; recent: string }): SftRecord[] {
  const { main, move } = targetsFor(labels);
  const record = (suffix: string, image: string, prompt: string, answer: unknown): SftRecord => ({
    id: `${id}-${suffix}`,
    messages: [
      { role: 'user', content: [{ type: 'image', image }, { type: 'text', text: prompt }] },
      { role: 'assistant', content: [{ type: 'text', text: JSON.stringify(answer) }] },
    ],
  });
  return [record('chart', images.chart, PROMPT, main), record('recent', images.recent, MOVE_PROMPT, move)];
}
