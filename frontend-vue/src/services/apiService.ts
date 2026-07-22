import type { GraphData, PathResult, StatsResponse } from '@/shared/types';

export const apiService = {
  // Fetch the complete dataset
  async fetchData(): Promise<GraphData> {
    try {
      const response = await fetch('/data.json');
      if (!response.ok) {
        throw new Error(`Failed to load dataset: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching data:', error);
      throw error;
    }
  },

  // Fetch statistics about the distribution
  async fetchStats(): Promise<StatsResponse | null> {
    try {
      const response = await fetch('/api/stats');
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('Error fetching stats:', error);
      return null;
    }
  },

  // Fetch all Linux families
  async fetchFamilies(): Promise<{ id: string; name: string; color: string }[]> {
    try {
      const response = await fetch('/api/families');
      if (!response.ok) return [];
      const json = await response.json();
      return json.families ?? [];
    } catch (error) {
      console.error('Error fetching families:', error);
      return [];
    }
  },

  // Search for distributions
  async searchDistributions(query: string, limit = 40): Promise<any[]> {
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`);
      if (!response.ok) return [];
      const json = await response.json();
      return json.results ?? [];
    } catch (error) {
      console.error('Error searching distributions:', error);
      return [];
    }
  },

  // Find path between two distributions
  async findPath(from: string, to: string): Promise<PathResult | null> {
    try {
      const response = await fetch(`/api/path?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('Error finding path:', error);
      return null;
    }
  },

  // Compare multiple distributions
  async compareDistributions(ids: string[]): Promise<any[]> {
    try {
      if (ids.length < 2) return [];
      const response = await fetch(`/api/compare?ids=${ids.join(',')}`);
      if (!response.ok) return [];
      const json = await response.json();
      return json.distros ?? [];
    } catch (error) {
      console.error('Error comparing distributions:', error);
      return [];
    }
  },

  // Suggest a new distribution (uses Wikipedia API)
  async suggestDistribution(topic: string, rationale?: string, submitter?: string): Promise<any> {
    try {
      const response = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, rationale, submitter })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Error suggesting distribution:', error);
      throw error;
    }
  },

  // Get OpenGraph image for a distribution
  getOGUrl(slug: string): string {
    return `/api/og/${encodeURIComponent(slug)}`;
  },

  // Health check
  async checkHealth(): Promise<any> {
    try {
      const response = await fetch('/api/health');
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('Error checking health:', error);
      return null;
    }
  }
};

export default apiService;