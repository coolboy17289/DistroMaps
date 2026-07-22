export function LoadingSkeleton() {
  return (
    <div className="loading-screen">
      <div className="loading-skeleton">
        <div className="loading-skeleton-brand">
          <div className="skeleton-circle" />
          <div className="skeleton-lines">
            <div className="skeleton-line skeleton-line--short" />
            <div className="skeleton-line skeleton-line--long" />
          </div>
        </div>
        <div className="loading-skeleton-graph">
          <div className="skeleton-ring skeleton-ring--outer" />
          <div className="skeleton-ring skeleton-ring--mid" />
          <div className="skeleton-ring skeleton-ring--inner" />
          <div className="skeleton-center-dot" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="skeleton-node"
              style={{
                transform: `rotate(${i * 45}deg) translateY(-80px)`,
              }}
            />
          ))}
        </div>
        <p className="loading-skeleton-text">Loading the Linux knowledge graph…</p>
      </div>
    </div>
  );
}
