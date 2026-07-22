'use client';

/**
 * Home page — Landing page with hero and 3D preview.
 */

import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-blue-950/20 via-gray-950 to-gray-950" />

      {/* Stars background */}
      <div className="absolute inset-0 opacity-30">
        {Array.from({ length: 100 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              opacity: Math.random() * 0.8 + 0.2,
              animation: `twinkle ${2 + Math.random() * 3}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 2}s`,
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 text-center px-6 max-w-3xl">
        {/* Logo */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20">
            <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-sm text-blue-400">Linux Ecosystem Knowledge Graph</span>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-6xl font-bold mb-6 bg-gradient-to-r from-white via-blue-100 to-blue-400 bg-clip-text text-transparent">
          DistroMap
        </h1>

        {/* Subtitle */}
        <p className="text-xl text-gray-400 mb-8 leading-relaxed">
          Explore the Linux universe through an interactive 3D knowledge graph.
          <br />
          <span className="text-gray-500">
            500+ distributions · 88 families · Infinite connections.
          </span>
        </p>

        {/* CTA */}
        <div className="flex items-center justify-center gap-4">
          <Link
            href="/graph"
            className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg
                       transition-colors shadow-lg shadow-blue-500/25"
          >
            Explore Graph
          </Link>
          <Link
            href="/families"
            className="px-8 py-3 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg
                       transition-colors border border-gray-700"
          >
            Browse Families
          </Link>
        </div>

        {/* Stats */}
        <div className="mt-16 grid grid-cols-3 gap-8 text-center">
          <div>
            <div className="text-3xl font-bold text-white">500+</div>
            <div className="text-sm text-gray-500">Distributions</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white">88</div>
            <div className="text-sm text-gray-500">Families</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white">12</div>
            <div className="text-sm text-gray-500">Relationships</div>
          </div>
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-gray-950 to-transparent" />

      <style jsx>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 1; }
        }
      `}</style>
    </main>
  );
}
