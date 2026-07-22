import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Cache for data
let distrosCache: any[] | null = null;
let statsCache: any = null;
let familiesCache: any[] | null = null;

// Load and cache data
function loadDistros() {
  if (!distrosCache) {
    const data = readFileSync(resolve('./public/data.json'), 'utf-8');
    distrosCache = JSON.parse(data);
  }
  return distrosCache;
}

function loadStats() {
  if (!statsCache) {
    const distros = loadDistros();
    const total = distros.length;
    const active = distros.filter((d: any) => d.status.toLowerCase() === 'active').length;
    const discontinued = total - active;
    const families = [...new Set(distros.map((d: any) => d.family))];
    
    statsCache = {
      totalDistros: total,
      active,
      discontinued,
      families: families.length,
    };
  }
  return statsCache;
}

function loadFamilies() {
  if (!familiesCache) {
    const distros = loadDistros();
    const familyMap = new Map<string, { id: string; name: string; count: number }>();
    
    distros.forEach((d: any) => {
      const family = d.family;
      if (!familyMap.has(family)) {
        familyMap.set(family, { id: family.toLowerCase(), name: family, count: 0 });
      }
      const fam = familyMap.get(family)!;
      fam.count++;
    });
    
    familiesCache = Array.from(familyMap.values()).map(f => ({
      id: f.id,
      name: f.name,
      color: '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')
    }));
  }
  return familiesCache;
}

// API handler
export default async (req: any, res: any) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const path = url.pathname;
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  
  try {
    if (path === '/api/health') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
      return;
    }
    
    if (path === '/api/stats') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(loadStats()));
      return;
    }
    
    if (path === '/api/families') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ families: loadFamilies() }));
      return;
    }
    
    if (path.startsWith('/api/search')) {
      const query = url.searchParams.get('q') || '';
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50);
      const distros = loadDistros();
      
      let results = distros;
      if (query) {
        const lowerQuery = query.toLowerCase();
        results = distros.filter((d: any) => 
          d.name.toLowerCase().includes(lowerQuery) || 
          (d.description && d.description.toLowerCase().includes(lowerQuery))
        );
      }
      
      results = results.slice(0, limit);
      
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ results, total: results.length }));
      return;
    }
    
    if (path === '/api/data') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(loadDistros()));
      return;
    }
    
    // For other endpoints, return empty array or basic response for now
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    
    if (path === '/api/suggest') {
      res.end(JSON.stringify({ ok: true, id: 'temp-' + Date.now() }));
    } else if (path.startsWith('/api/path') || path.startsWith('/api/compare')) {
      res.end(JSON.stringify([]));
    } else {
      res.end(JSON.stringify({}));
    }
    
  } catch (error) {
    console.error('API error:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'internal_error', message: (error as Error).message }));
  }
};
