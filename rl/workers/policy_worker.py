"""Policy worker: wraps a trainable policy model and optimizer.

This worker is used for on-policy updates in GRPO / PPO. When verl is
enabled, it delegates to verl's FSDP/Megatron worker primitives; otherwise
it falls back to a minimal PyTorch trainer for CPU/single-GPU testing.
"""

import math
from typing import Any, Dict, List, Optional, Sequence

import torch
import torch.nn.functional as F
from torch.optim import AdamW


class PolicyWorker:
    """Trainable policy wrapper with GRPO/PPO loss."""

    def __init__(
        self,
        model_name: str = "gpt2",
        device: str = "cpu",
        lr: float = 1e-5,
        weight_decay: float = 0.01,
        grad_clip: float = 1.0,
        use_verl: bool = True,
    ) -> None:
        self.model_name = model_name
        self.device = device if device != "auto" else ("cuda" if torch.cuda.is_available() else "cpu")
        self.lr = lr
        self.weight_decay = weight_decay
        self.grad_clip = grad_clip
        self.use_verl = use_verl
        self._model = None
        self._optimizer = None
        self._tokenizer = None
        self._verl_actor = None

    def load(self) -> None:
        if self.use_verl:
            try:
                from verl.trainer.ppo.ray_fsdp_workers import ActorWorker as VerlActorWorker

                self._verl_actor = VerlActorWorker()
                return
            except Exception as exc:
                print(f"[PolicyWorker] verl actor unavailable ({exc}); falling back to PyTorch.")
                self.use_verl = False

        if self._model is None:
            from transformers import AutoModelForCausalLM, AutoTokenizer

            self._tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            if self._tokenizer.pad_token is None:
                self._tokenizer.pad_token = self._tokenizer.eos_token
            self._model = AutoModelForCausalLM.from_pretrained(self.model_name).to(self.device)
            self._optimizer = AdamW(
                self._model.parameters(),
                lr=self.lr,
                weight_decay=self.weight_decay,
            )

    def tokenize(self, texts: Sequence[str]) -> Dict[str, torch.Tensor]:
        assert self._tokenizer is not None
        return self._tokenizer(
            list(texts),
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=1024,
        ).to(self.device)

    def compute_logprobs(self, prompts: Sequence[str], completions: Sequence[str]) -> torch.Tensor:
        """Compute token-level log-probs for prompt+completion sequences."""
        self.load()
        if self._verl_actor is not None:
            # verl path: delegate compute log prob to the actor worker.
            return self._verl_actor.compute_log_prob(prompts, completions)

        assert self._model is not None and self._tokenizer is not None
        texts = [f"{p}{c}" for p, c in zip(prompts, completions)]
        inputs = self.tokenize(texts)
        with torch.cuda.amp.autocast(enabled=self.device != "cpu"):
            outputs = self._model(**inputs)
        logits = outputs.logits[:, :-1, :]
        labels = inputs["input_ids"][:, 1:]
        log_probs = F.log_softmax(logits, dim=-1)
        token_log_probs = torch.gather(log_probs, dim=-1, index=labels.unsqueeze(-1)).squeeze(-1)
        mask = inputs["attention_mask"][:, 1:]
        return (token_log_probs * mask).sum(dim=-1) / mask.sum(dim=-1).clamp(min=1)

    def grpo_step(
        self,
        groups: Sequence[Sequence[Dict[str, Any]]],
        kl_coef: float = 0.01,
        clip_eps: float = 0.2,
    ) -> Dict[str, float]:
        """Run a single GRPO policy update over grouped rollouts."""
        from rl.reward_functions import normalize_rewards

        self.load()
        if self._verl_actor is not None:
            # verl native GRPO path.
            return self._verl_actor.update_policy(grpo_groups=groups, kl_coef=kl_coef, clip_eps=clip_eps)

        assert self._model is not None and self._optimizer is not None
        self._model.train()

        total_loss = 0.0
        total_kl = 0.0
        n_groups = 0
        for group in groups:
            if not group:
                continue
            rewards = [item.get("total_reward", 0.0) for item in group]
            advantages = normalize_rewards(rewards)
            prompts = [item["prompt"] for item in group]
            completions = [item["completion"] for item in group]
            new_logprobs = self.compute_logprobs(prompts, completions)
            old_logprobs = torch.tensor(
                [sum(item.get("logprobs", [])) for item in group],
                dtype=torch.float32,
                device=self.device,
            )
            ratios = torch.exp(new_logprobs - old_logprobs)
            adv_t = torch.tensor(advantages, dtype=torch.float32, device=self.device)
            surr1 = ratios * adv_t
            surr2 = torch.clamp(ratios, 1 - clip_eps, 1 + clip_eps) * adv_t
            policy_loss = -torch.min(surr1, surr2).mean()
            kl = (old_logprobs - new_logprobs).pow(2).mean()
            loss = policy_loss + kl_coef * kl
            loss.backward()
            torch.nn.utils.clip_grad_norm_(self._model.parameters(), self.grad_clip)
            self._optimizer.step()
            self._optimizer.zero_grad()
            total_loss += float(loss)
            total_kl += float(kl)
            n_groups += 1

        return {
            "loss": total_loss / max(n_groups, 1),
            "kl": total_kl / max(n_groups, 1),
        }

    def save_checkpoint(self, path: str) -> None:
        if self._model is None:
            return
        torch.save(self._model.state_dict(), path)

    def load_checkpoint(self, path: str) -> None:
        self.load()
        if self._model is not None:
            self._model.load_state_dict(torch.load(path, map_location=self.device))
