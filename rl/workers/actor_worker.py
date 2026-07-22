"""Actor worker: generates rollout completions for a batch of prompts.

Designed to run as a Ray remote actor or a local worker pool member.
"""

import random
import time
from typing import Any, Dict, List

import torch


class ActorWorker:
    """Local / Ray-compatible actor generating text rollouts."""

    def __init__(
        self,
        model_name: str = "gpt2",
        device: str = "cpu",
        temperature: float = 1.0,
        max_seq_len: int = 1024,
    ) -> None:
        self.model_name = model_name
        self.device = device if device != "auto" else ("cuda" if torch.cuda.is_available() else "cpu")
        self.temperature = temperature
        self.max_seq_len = max_seq_len
        self._model = None
        self._tokenizer = None
        self._rng = random.Random(0)

    def load(self) -> None:
        """Lazy-load model and tokenizer."""
        if self._model is not None:
            return
        try:
            from transformers import AutoModelForCausalLM, AutoTokenizer

            self._tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            if self._tokenizer.pad_token is None:
                self._tokenizer.pad_token = self._tokenizer.eos_token
            self._model = AutoModelForCausalLM.from_pretrained(self.model_name).to(self.device)
            self._model.eval()
        except Exception as exc:
            raise RuntimeError(f"Failed to load actor model {self.model_name}: {exc}") from exc

    @torch.inference_mode()
    def generate(
        self,
        prompts: List[str],
        max_new_tokens: int = 64,
        do_sample: bool = True,
    ) -> List[Dict[str, Any]]:
        """Generate completions for a list of prompts.

        Returns a list of dicts with keys: prompt, completion, logprobs, tokens,
        start_time, end_time.
        """
        self.load()
        assert self._tokenizer is not None and self._model is not None
        results: List[Dict[str, Any]] = []
        for prompt in prompts:
            start = time.perf_counter()
            inputs = self._tokenizer(prompt, return_tensors="pt", truncation=True, max_length=self.max_seq_len).to(
                self.device
            )
            outputs = self._model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                do_sample=do_sample,
                temperature=self.temperature,
                pad_token_id=self._tokenizer.pad_token_id,
                eos_token_id=self._tokenizer.eos_token_id,
                return_dict_in_generate=True,
                output_scores=True,
            )
            generated_ids = outputs.sequences[0][inputs["input_ids"].shape[1] :]
            completion = self._tokenizer.decode(generated_ids, skip_special_tokens=True)
            # Collect per-token log-probs
            logprobs: List[float] = []
            for score_tensor in outputs.scores:
                probs = torch.softmax(score_tensor[0] / max(self.temperature, 1e-6), dim=-1)
                token_id = generated_ids[len(logprobs)] if len(logprobs) < len(generated_ids) else generated_ids[-1]
                logprobs.append(float(torch.log(probs[token_id] + 1e-10)))
            end = time.perf_counter()
            results.append(
                {
                    "prompt": prompt,
                    "completion": completion,
                    "tokens": generated_ids.tolist(),
                    "logprobs": logprobs,
                    "start_time": start,
                    "end_time": end,
                    "elapsed_seconds": end - start,
                }
            )
        return results

    def rollout(
        self,
        prompts: List[str],
        group_size: int = 1,
        max_new_tokens: int = 64,
    ) -> List[List[Dict[str, Any]]]:
        """Generate `group_size` rollouts per prompt (used by GRPO)."""
        groups: List[List[Dict[str, Any]]] = []
        for prompt in prompts:
            group = self.generate([prompt] * group_size, max_new_tokens=max_new_tokens)
            for item in group:
                item["group_prompt"] = prompt
            groups.append(group)
        return groups
