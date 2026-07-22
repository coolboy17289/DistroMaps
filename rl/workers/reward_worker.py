"""Reward worker: evaluates completions and returns reward vectors.

Runs in parallel to avoid blocking the training loop on reward computation.
"""

from typing import Any, Dict, List, Sequence

from rl.reward_functions import RewardMixer


class RewardWorker:
    """Local / Ray-compatible reward evaluator."""

    def __init__(self, mixer: RewardMixer) -> None:
        self.mixer = mixer

    def evaluate(self, rollouts: Sequence[Dict[str, Any]], metadatas: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Attach reward vectors to a batch of rollouts."""
        assert len(rollouts) == len(metadatas)
        results: List[Dict[str, Any]] = []
        for rollout, metadata in zip(rollouts, metadatas):
            rewards = self.mixer.compute(rollout["prompt"], rollout["completion"], metadata)
            results.append({**rollout, "rewards": rewards, "total_reward": sum(rewards.values())})
        return results

    def evaluate_groups(
        self,
        groups: Sequence[Sequence[Dict[str, Any]]],
        metadatas: Sequence[Dict[str, Any]],
    ) -> List[List[Dict[str, Any]]]:
        """Evaluate grouped rollouts (GRPO): one metadata dict per group."""
        assert len(groups) == len(metadatas)
        return [self.evaluate(group, [metadatas[i]] * len(group)) for i, group in enumerate(groups)]
