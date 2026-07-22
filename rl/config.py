"""Configuration dataclasses for the RL backend."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class ModelConfig:
    """Policy / value model configuration."""

    name: str = "gpt2"
    device: str = "auto"
    dtype: str = "fp16"
    max_seq_len: int = 1024
    vocab_size: Optional[int] = None


@dataclass
class OptimizerConfig:
    lr: float = 1e-5
    weight_decay: float = 0.01
    betas: List[float] = field(default_factory=lambda: [0.9, 0.999])
    eps: float = 1e-8
    warmup_steps: int = 10
    grad_clip: float = 1.0


@dataclass
class RewardConfig:
    """Multi-reward verifier weights."""

    correctness_weight: float = 1.0
    format_weight: float = 0.3
    execution_time_weight: float = 0.1
    repetition_penalty: float = -0.2
    max_execution_seconds: float = 5.0


@dataclass
class GRPOConfig:
    """Group Relative Policy Optimization settings."""

    group_size: int = 8
    kl_coef: float = 0.01
    clip_eps: float = 0.2
    temperature: float = 1.0
    use_baselines: bool = True


@dataclass
class PPOConfig:
    """Proximal Policy Optimization settings."""

    gamma: float = 0.99
    gae_lambda: float = 0.95
    clip_eps: float = 0.2
    value_loss_coef: float = 0.5
    entropy_coef: float = 0.01
    epochs_per_batch: int = 2


@dataclass
class TrainingConfig:
    """Top-level training configuration."""

    algorithm: str = "grpo"  # "grpo" | "ppo"
    total_steps: int = 1000
    batch_size: int = 32
    micro_batch_size: int = 4
    log_interval: int = 10
    eval_interval: int = 100
    checkpoint_interval: int = 250
    output_dir: str = "outputs"
    seed: int = 42
    model: ModelConfig = field(default_factory=ModelConfig)
    optimizer: OptimizerConfig = field(default_factory=OptimizerConfig)
    reward: RewardConfig = field(default_factory=RewardConfig)
    grpo: GRPOConfig = field(default_factory=GRPOConfig)
    ppo: PPOConfig = field(default_factory=PPOConfig)
    rollout_workers: int = 4
    reward_workers: int = 2
    verl_enabled: bool = True

    def to_dict(self) -> Dict[str, Any]:
        from dataclasses import asdict

        return asdict(self)


@dataclass
class TelemetryConfig:
    """WebSocket / gRPC telemetry server configuration."""

    host: str = "0.0.0.0"
    ws_port: int = 8765
    grpc_port: int = 50051
    http_port: int = 8000
    metrics_interval: float = 1.0
    max_clients: int = 100
    enable_prometheus: bool = True
