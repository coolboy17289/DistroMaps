"""Vectorized, deterministic reward functions for RL training.

Each verifier receives a rollout trajectory and returns a scalar reward.
Rewards are normalized per-batch to support GRPO/PPO baselines.
"""

import re
import time
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Sequence

import numpy as np


class RewardVerifier(ABC):
    """Base class for reward verifiers."""

    def __init__(self, weight: float = 1.0) -> None:
        self.weight = weight

    @abstractmethod
    def score(self, prompt: str, completion: str, metadata: Dict[str, Any]) -> float:
        """Return a scalar reward for a single (prompt, completion) pair."""
        ...

    def __call__(self, prompt: str, completion: str, metadata: Dict[str, Any]) -> float:
        return self.weight * self.score(prompt, completion, metadata)


class CorrectnessVerifier(RewardVerifier):
    """Reward based on whether the completion matches a known answer.

    Supports exact, substring, and regex matching.
    """

    def __init__(self, weight: float = 1.0, match_mode: str = "substring") -> None:
        super().__init__(weight)
        self.match_mode = match_mode

    def score(self, prompt: str, completion: str, metadata: Dict[str, Any]) -> float:
        expected = metadata.get("answer")
        if expected is None:
            return 0.0
        completion_norm = completion.strip().lower()
        expected_norm = str(expected).strip().lower()
        if self.match_mode == "exact":
            return 1.0 if completion_norm == expected_norm else 0.0
        if self.match_mode == "substring":
            return 1.0 if expected_norm in completion_norm else 0.0
        if self.match_mode == "regex":
            try:
                return 1.0 if re.search(expected_norm, completion_norm) else 0.0
            except re.error:
                return 0.0
        return 0.0


class FormatVerifier(RewardVerifier):
    """Reward based on structural/format compliance."""

    def __init__(self, weight: float = 0.3, required_patterns: Sequence[str] = ()) -> None:
        super().__init__(weight)
        self.required_patterns = list(required_patterns)

    def score(self, prompt: str, completion: str, metadata: Dict[str, Any]) -> float:
        if not self.required_patterns:
            # Default: reward presence of a code block or concise answer.
            has_codeblock = "```" in completion
            has_bullets = bool(re.search(r"^\s*[-*]\s+", completion, re.MULTILINE))
            return float(has_codeblock or has_bullets or len(completion.strip()) > 20)
        score = 0.0
        for pattern in self.required_patterns:
            if re.search(pattern, completion):
                score += 1.0 / len(self.required_patterns)
        return score


class ExecutionTimeVerifier(RewardVerifier):
    """Reward shorter wall-clock execution / rollout latency."""

    def __init__(self, weight: float = 0.1, max_seconds: float = 5.0, target_seconds: float = 1.0) -> None:
        super().__init__(weight)
        self.max_seconds = max_seconds
        self.target_seconds = target_seconds

    def score(self, prompt: str, completion: str, metadata: Dict[str, Any]) -> float:
        elapsed = metadata.get("elapsed_seconds", self.max_seconds)
        if elapsed <= 0:
            elapsed = 1e-6
        # Piecewise: 1.0 if under target, linear decay to 0.0 at max.
        if elapsed <= self.target_seconds:
            return 1.0
        if elapsed >= self.max_seconds:
            return 0.0
        return 1.0 - (elapsed - self.target_seconds) / (self.max_seconds - self.target_seconds)


class RepetitionPenaltyVerifier(RewardVerifier):
    """Penalize repetitive n-grams."""

    def __init__(self, weight: float = -0.2, n: int = 3, threshold: int = 2) -> None:
        super().__init__(weight)
        self.n = n
        self.threshold = threshold

    def score(self, prompt: str, completion: str, metadata: Dict[str, Any]) -> float:
        tokens = completion.strip().split()
        if len(tokens) < self.n:
            return 0.0
        ngrams: Dict[tuple, int] = {}
        for i in range(len(tokens) - self.n + 1):
            grams = tuple(tokens[i : i + self.n])
            ngrams[grams] = ngrams.get(grams, 0) + 1
        repeats = sum(1 for c in ngrams.values() if c > self.threshold)
        return -min(repeats / max(1, len(ngrams)), 1.0)


class RewardMixer:
    """Combines multiple verifiers into a single reward vector per rollout."""

    def __init__(self, verifiers: Sequence[RewardVerifier]) -> None:
        self.verifiers = list(verifiers)

    def compute(self, prompt: str, completion: str, metadata: Dict[str, Any]) -> Dict[str, float]:
        start = time.perf_counter()
        rewards: Dict[str, float] = {}
        for verifier in self.verifiers:
            name = type(verifier).__name__.replace("Verifier", "").lower()
            rewards[name] = float(verifier(prompt, completion, metadata))
        rewards["_latency_seconds"] = time.perf_counter() - start
        return rewards

    def total(self, prompt: str, completion: str, metadata: Dict[str, Any]) -> float:
        return sum(self.compute(prompt, completion, metadata).values())


def normalize_rewards(rewards: List[float], eps: float = 1e-6) -> np.ndarray:
    """Z-score normalize a list of rewards (used by GRPO baselines)."""
    arr = np.asarray(rewards, dtype=np.float32)
    mean = arr.mean()
    std = arr.std()
    if std < eps:
        return np.zeros_like(arr)
    return (arr - mean) / (std + eps)


def gae_advantages(
    rewards: Sequence[float],
    values: Sequence[float],
    gamma: float = 0.99,
    lam: float = 0.95,
) -> np.ndarray:
    """Compute Generalized Advantage Estimation advantages."""
    rewards_arr = np.asarray(rewards, dtype=np.float32)
    values_arr = np.asarray(values + [0.0], dtype=np.float32)  # bootstrap value
    advantages = np.zeros_like(rewards_arr)
    gae = 0.0
    for t in reversed(range(len(rewards_arr))):
        delta = rewards_arr[t] + gamma * values_arr[t + 1] - values_arr[t]
        gae = delta + gamma * lam * gae
        advantages[t] = gae
    return advantages


def build_default_mixer(config: Dict[str, Any]) -> RewardMixer:
    """Build the default reward mixer from a config dict."""
    reward_cfg = config.get("reward", {})
    return RewardMixer(
        [
            CorrectnessVerifier(weight=reward_cfg.get("correctness_weight", 1.0)),
            FormatVerifier(weight=reward_cfg.get("format_weight", 0.3)),
            ExecutionTimeVerifier(
                weight=reward_cfg.get("execution_time_weight", 0.1),
                max_seconds=reward_cfg.get("max_execution_seconds", 5.0),
            ),
            RepetitionPenaltyVerifier(weight=reward_cfg.get("repetition_penalty", -0.2)),
        ]
    )
