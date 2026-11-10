# QLoRA fine-tuning plan (NOT run, NOT tested)

Status 2026-11-11: **plan only.** No training has been run on this PC: Python 3.12 is installed but
PyTorch and the training libraries are not. Nothing below has been verified locally, and no claim
is made that it fits in memory or improves results until it is run and evaluated.

## Goal

Make the local model better at the two questions the extension already asks, without changing their
format: `structure` / `visibleTrend` on the whole crop and `latestMove` on the newest-candles strip.
The baseline (`../reports/BASELINE.md`) shows where it fails: up/down bias, "bounced then turned down"
never recognised, sideways ranges never recognised.

## Base model

`Qwen/Qwen3-VL-2B-Instruct` (the same family as `qwen3-vl:2b-instruct` in Ollama). 2B rather than 4B
because the owner's GPU is an RTX 4060 with 8 GB VRAM. Unsloth's generic table lists about 3.5 GB
for QLoRA on a 3B model; a 2B model should need less, but that is an extrapolation, not a
measurement for Qwen3-VL, and images and sequence length add memory.

## Tooling (check current docs before installing)

- **Unsloth** documents Qwen3-VL fine-tuning support (https://docs.unsloth.ai/models/qwen3-vl-run-and-fine-tune).
  Its published notebooks target the 8B model; adapt to 2B.
- **Hugging Face transformers** loads Qwen3-VL with `Qwen3VLForConditionalGeneration` + `AutoProcessor`
  (e.g. https://www.datacamp.com/tutorial/fine-tuning-qwen3-vl-8b), with PEFT for LoRA.
- Check each tool's install guide for Windows support (bitsandbytes / Triton); WSL2 may be required.

## Data

`npm run training:sft` writes `../data/sft/train.jsonl` and `validation.jsonl` (test is never
exported). Each line is a multimodal chat record: user turn = image + the extension's exact prompt,
assistant turn = the exact JSON the extension parses. Image paths are relative to `training/data/`.
Verify the record layout matches the chosen tool's vision data collator.

**Do not train on synthetic data alone.** It looks nothing like a real platform, so a model tuned
only on it will likely get better on synthetic charts and not on real ones. Collect and label real,
privacy-reviewed exports first (at least a few hundred, across sessions and market conditions).

## Starting settings (hypotheses to tune on the validation split)

| Setting | Start | Why |
|---|---|---|
| Base weights | 4-bit (QLoRA) | 8 GB VRAM |
| LoRA rank / alpha / dropout | 16 / 16 / 0 | common small-model default |
| Train vision encoder | no (language layers first) | less memory; images are simple charts |
| Batch size / grad accumulation | 1 / 8 | memory |
| Max image side | 1024 px | same as the extension sends |
| Learning rate / epochs | 2e-4 / 2-3 | stop early when validation stops improving |
| Temperature at eval | 0 | same as the extension |

Close Ollama (it holds about 4.8 GB of VRAM with the 4B model loaded) before training.

## Getting a trained model back into the extension (all gates must pass)

1. Merge the LoRA adapter and convert to GGUF **including the vision projector**, then
   `ollama create chartsense-qwen3vl-2b-ft -f Modelfile`. **Unverified:** some sources say Ollama does
   not support a separate vision-projector (mmproj) file for imported vision models; check the current
   Ollama import docs (https://ollama.readthedocs.io/en/import/) and test before anything else.
2. `npm run training:eval -- --model chartsense-qwen3vl-2b-ft` on the **same test fingerprint** as the baseline.
3. Add it to `VISION_MODELS` in `ollama.ts` only if, on real (not only synthetic) test data:
   invalid JSON rate is not worse, `latestMove` and `structure` accuracy and rule decision agreement
   improve, mirrored up/down cases are handled symmetrically, and p95 latency stays well under half
   of the shortest horizon used.
4. Record the result and decision in `docs/DECISIONS.md`. A better model still says nothing about
   whether the signals make money: that is measured only by the paper-trading journal.
