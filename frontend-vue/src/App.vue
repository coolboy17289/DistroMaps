<template>
  <div class="min-h-screen bg-gray-900 text-gray-100 flex flex-col md:flex-row">
    <!-- Left Sidebar -->
    <aside class="md:w-64 w-full bg-gray-800 border-r border-gray-700 p-4 md:border-r-0 md:border-b mb-4 md:mb-0 overflow-y-auto">
      <div class="space-y-6">
        <div class="text-center">
          <h1 class="text-2xl font-bold text-cyan-400">DistroMap</h1>
          <p class="text-sm text-gray-400">Explore the Linux Ecosystem</p>
        </div>

        <!-- Search -->
        <div>
          <label class="block text-sm font-medium mb-1">Search Distributions</label>
          <div class="relative">
            <input
              type="text"
              v-model="searchQuery"
              @input="handleSearchInput"
              class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder="Search distributions..."
            >
            <svg class="absolute inset-y-0 right-2.5 my-auto h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 105.636 3.636m13.364 13.363l-1.414-1.414"></path></svg>
          </div>
          <div v-if="searchResults.length > 0" class="mt-2 max-h-60 overflow-y-auto">
            <div v-for="result in searchResults" :key="result.id" class="p-2 bg-gray-700/50 rounded-md hover:bg-gray-600 cursor-pointer" @click="selectSearchResult(result.id)">
              <div class="flex justify-between">
                <div class="font-medium">{{ result.name }}</div>
                <div class="text-xs text-gray-400">{{ result.family }}</div>
              </div>
              <div class="text-xs text-gray-500">{{ result.description }}</div>
            </div>
          </div>
        </div>

        <!-- Filters -->
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-1">Linux Families</label>
            <div class="space-y-1">
              <label class="flex items-center">
                <input type="checkbox" v-model="selectedFamilies.debian" class="form-checkbox h-4 w-4 text-cyan-500">
                <span class="ml-2">Debian</span>
              </label>
              <label class="flex items-center">
                <input type="checkbox" v-model="selectedFamilies.redhat" class="form-checkbox h-4 w-4 text-cyan-500">
                <span class="ml-2">Red Hat</span>
              </label>
              <label class="flex items-center">
                <input type="checkbox" v-model="selectedFamilies.arch" class="form-checkbox h-4 w-4 text-cyan-500">
                <span class="ml-2">Arch</span>
              </label>
              <label class="flex items-center">
                <input type="checkbox" v-model="selectedFamilies.suse" class="form-checkbox h-4 w-4 text-cyan-500">
                <span class="ml-2">SUSE</span>
              </label>
              <label class="flex items-center">
                <input type="checkbox" v-model="selectedFamilies.independent" class="form-checkbox h-4 w-4 text-cyan-500">
                <span class="ml-2">Independent</span>
              </label>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">Package Managers</label>
            <div class="space-y-1">
              <label class="flex items-center">
                <input type="checkbox" v-model="selectedPackageManagers.apt" class="form-checkbox h-4 w-4 text-cyan-500">
                <span class="ml-2">APT</span>
              </label>
              <label class="flex items-center">
                <input type="checkbox" v-model="selectedPackageManagers.yum" class="form-checkbox h-4 w-4 text-cyan-500">
                <span class="ml-2">DNF/YUM</span>
              </label>
              <label class="flex items-center">
                <input type="checkbox" v-model="selectedPackageManagers.pacman" class="form-checkbox h-4 w-4 text-cyan-500">
                <span class="ml-2">Pacman</span>
              </label>
              <label class="flex items-center">
                <input type="checkbox" v-model="selectedPackageManagers.zypper" class="form-checkbox h-4 w-4 text-cyan-500">
                <span class="ml-2">Zypper</span>
              </label>
              <label class="flex items-center">
                <input type="checkbox" v-model="selectedPackageManagers.portage" class="form-checkbox h-4 w-4 text-cyan-500">
                <span class="ml-2">Portage</span>
              </label>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">Desktop Environments</label>
            <div class="space-y-1">
              <label class="flex items-center">
                <input type="checkbox" v-model="selectedDesktops.gnome" class="form-checkbox h-4 w-4 text-cyan-500">
                <span class="ml-2">GNOME</span>
              </label>
              <label class="flex items-center">
                <input type="checkbox" v-model="selectedDesktops.kde" class="form-checkbox h-4 w-4 text-cyan-500">
                <span class="ml-2">KDE</span>
              </label>
              <label class="flex items-center">
                <input type="checkbox" v-model="selectedDesktops.xfce" class="form-checkbox h-4 w-4 text-cyan-500">
                <span class="ml-2">XFCE</span>
              </label>
              <label class="flex items-center">
                <input type="checkbox" v-model="selectedDesktops.lxqt" class="form-checkbox h-4 w-4 text-cyan-500">
                <span class="ml-2">LXQt</span>
              </label>
              <label class="flex items-center">
                <input type="checkbox" v-model="selectedDesktops.cinnamon" class="form-checkbox h-4 w-4 text-cyan-500">
                <span class="ml-2">Cinnamon</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Stats -->
        <div class="mt-4 pt-4 border-t border-gray-700">
          <h2 class="text-lg font-semibold text-cyan-400 mb-3">Statistics</h2>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span>Total Distributions:</span>
              <span class="font-medium">{{ stats?.totalDistros ?? 0 }}</span>
            </div>
            <div class="flex justify-between">
              <span>Active:</span>
              <span class="text-green-500 font-medium">{{ stats?.active ?? 0 }}</span>
            </div>
            <div class="flex justify-between">
              <span>Discontinued:</span>
              <span class="text-red-500 font-medium">{{ stats?.discontinued ?? 0 }}</span>
            </div>
            <div class="flex justify-between">
              <span>Families:</span>
              <span class="font-medium">{{ stats?.families ?? 0 }}</span>
            </div>
          </div>
        </div>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 min-h-[80vh] md:w-2/3 p-4 md:p-6 relative">
      <!-- Graph Toggle Button -->
      <div class="absolute top-2 right-2 z-10">
        <button @click="toggleGraphVisibility" class="bg-gray-700/50 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm flex items-center transition-colors">
          <svg class="w-4 h-4 mr-1" :class="{'rotate-180': !graphVisible}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
          <span class="ml-1">{{ graphVisible ? 'Hide Graph' : 'Show Graph' }}</span>
        </button>
      </div>

      <!-- Linux Graph Visualization -->
      <div v-if="graphVisible" class="w-full h-full">
        <LinuxGraph ref="linuxGraph" class="w-full h-full" />
      </div>

      <!-- Auto Researcher Button -->
      <div v-if="graphVisible" class="absolute bottom-4 left-4 bg-blue-600/50 backdrop-blur-sm border border-blue-500/50 rounded-lg p-3 hover:bg-blue-600/700 transition-all">
        <button @click="startAutoResearch" class="flex items-center space-x-2 text-sm font-medium text-white hover:text-yellow-300">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
          <span>Auto Research</span>
        </button>
      </div>
    </main>

    <!-- Right Panel -->
    <aside class="md:w-64 w-full bg-gray-800 border-l border-gray-700 p-4 md:border-l-0 md:border-t mt-4 md:mt-0 overflow-y-auto">
      <div class="space-y-6">
        <!-- Selected Distribution Info -->
        <div v-if="selectedDistro" class="space-y-4">
          <div class="text-center py-4 border-b border-gray-700 pb-4">
            <h2 class="text-xl font-bold" :style="{ color: getDistroColor(selectedDistro.family) }">
              🐧 {{ selectedDistro.name }}
            </h2>
            <p class="text-sm text-gray-400">{{ selectedDistro.family }} Family</p>
          </div>

          <div class="space-y-3">
            <div class="text-sm">
              <div class="flex">
                <span class="w-1/3 font-medium">Founded:</span>
                <span>{{ selectedDistro.founded || 'Unknown' }}</span>
              </div>
              <div class="flex">
                <span class="w-1/3 font-medium">Origin:</span>
                <span>{{ selectedDistro.country || 'International' }}</span>
              </div>
              <div class="flex">
                <span class="w-1/3 font-medium">Status:</span>
                <span class="px-2 py-1 rounded" :class="{
                  'bg-green-600': selectedDistro.status === 'active',
                  'bg-yellow-600': selectedDistro.status === 'legacy',
                  'bg-red-600': selectedDistro.status === 'discontinued'
                }">{{ selectedDistro.status?.toUpperCase() }}</span>
              </div>
              <div class="flex">
                <span class="w-1/3 font-medium">Package Manager:</span>
                <span>{{ selectedDistro.packageManager || 'Unknown' }}</span>
              </div>
              <div class="flex">
                <span class="w-1/3 font-medium">Init System:</span>
                <span>{{ selectedDistro.initSystem || 'Unknown' }}</span>
              </div>
              <div class="flex">
                <span class="w-1/3 font-medium">Release Model:</span>
                <span>{{ selectedDistro.releaseModel || 'Unknown' }}</span>
              </div>
            </div>

            <div class="mt-3">
              <h3 class="text-lg font-semibold text-cyan-400 mb-2">Description</h3>
              <p class="text-sm text-gray-300 leading-relaxed">{{ selectedDistro.description || 'No description available.' }}</p>
            </div>

            <div class="mt-4">
              <h3 class="text-lg font-semibold text-cyan-400 mb-2">Resources</h3>
              <div class="space-y-2">
                <a
                  v-if="selectedDistro.website"
                  :href="selectedDistro.website"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="block px-3 py-2 bg-gray-700/50 rounded-md hover:bg-gray-600 text-sm flex items-center space-x-2"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l9-5-9-5-9 5 9 5z"></path></svg>
                  <span>Visit Website</span>
                </a>
                <a
                  v-if="selectedDistro.wikipedia"
                  :href="selectedDistro.wikipedia"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="block px-3 py-2 bg-gray-700/50 rounded-md hover:bg-gray-600 text-sm flex items-center space-x-2"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m2 0a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  <span>Wikipedia</span>
                </a>
              </div>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="mt-6 pt-4 border-t border-gray-700">
            <button
              @click="findConnections"
              class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
              Find Connections
            </button>

            <button
              @click="compareWithOthers"
              class="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg mt-2 transition-colors flex items-center justify-center space-x-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.1 0-2 .9-2 2s0 2 1.1 2m0 4h-1a2 2 0 00-1.405 .8l-2 1.2A2 2 0 004 16.005a2 2 0 000 3.99l2 1.2a2 2 0 001.405.8h1v3a2 2 0 002 2h5.86l-.94 3.19a2 2 0 002.131 1.319l2.49-1.08a2 2 0 002.04-.91l1.31-2.7a2 2 0 00-1.48-1.758L13 16h-1z"></path></svg>
              Compare
            </button>
          </div>
        </div>

        <!-- User Suggestion Section -->
        <div v-else class="text-center py-8">
          <p class="text-gray-400">Select a distribution to view details</p>

          <!-- Suggestion Form -->
          <div class="mt-6 pt-4 border-t border-gray-700">
            <h3 class="text-lg font-semibold text-cyan-400 mb-4">Suggest a Distribution</h3>
            <form @submit.prevent="submitSuggestion" class="space-y-3">
              <div>
                <label class="block text-sm font-medium mb-1">Distribution Name (Wikipedia Title)</label>
                <input
                  type="text"
                  v-model="suggestion.topic"
                  class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  placeholder="e.g., Alpine_Linux"
                >
              </div>

              <div>
                <label class="block text-sm font-medium mb-1">Why should this be included?</label>
                <textarea
                  v-model="suggestion.rationale"
                  rows="3"
                  class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  placeholder="Briefly explain why this distribution is notable..."
                ></textarea>
              </div>

              <div>
                <label class="block text-sm font-medium mb-1">Your Name (Optional)</label>
                <input
                  type="text"
                  v-model="suggestion.submitter"
                  class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  placeholder="@yourname or leave anonymous"
                >
              </div>

              <button
                type="submit"
                :disabled="suggestionSubmitting"
                class="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
              >
                <template v-if="!suggestionSubmitting">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                  <span>Submit Suggestion</span>
                </template>
                <template v-else>
                  <span class="animate-spin"></span>
                  <span class="ml-2">Submitting...</span>
                </template>
              </button>
            </form>

            <div v-if="suggestionResult" class="mt-4 p-3 rounded-lg" :class="{
              'bg-green-600/20': suggestionResult.status === 'success',
              'bg-red-600/20': suggestionResult.status === 'error'
            }">
              <p class="text-sm text-center" :class="{
                'text-green-400': suggestionResult.status === 'success',
                'text-red-400': suggestionResult.status === 'error'
              }">
                {{ suggestionResult.message }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onMounted } from 'vue';
import LinuxGraph from './components/LinuxGraph.vue';
import apiService from './services/apiService';

// State
const searchQuery = ref('');
const searchResults = ref([]);
const selectedDistro = ref(null);
const suggestion = reactive({
  topic: '',
  rationale: '',
  submitter: ''
});
const suggestionResult = ref(null);
const suggestionSubmitting = ref(false);
const stats = ref(null);
const graphVisible = ref(true);

// Selection states for filters
const selectedFamilies = reactive({
  debian: true,
  redhat: true,
  arch: true,
  suse: true,
  independent: true
});

const selectedPackageManagers = reactive({
  apt: true,
  yum: true,
  pacman: true,
  zypper: true,
  portage: true
});

const selectedDesktops = reactive({
  gnome: true,
  kde: true,
  xfce: true,
  lxqt: true,
  cinnamon: true
});

// Debounce timer for search
let searchDebounceTimer = null;

// Initialize
onMounted(async () => {
  await loadInitialData();
});

// Load initial data
const loadInitialData = async () => {
  try {
    // Load statistics
    const statsData = await apiService.fetchStats();
    stats.value = statsData;
  } catch (error) {
    console.error('Failed to load initial data:', error);
  }
};

// Handle search input with debouncing
const handleSearchInput = () => {
  // Clear existing timer
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }

  // Set new timer
  searchDebounceTimer = setTimeout(async () => {
    await performSearch();
  }, 300); // 300ms debounce
};

// Perform search
const performSearch = async () => {
  const query = searchQuery.value.trim();
  if (!query || query.length < 2) {
    searchResults.value = [];
    return;
  }

  try {
    const results = await apiService.searchDistributions(query, 10);
    searchResults.value = results;
  } catch (error) {
    console.error('Search error:', error);
    searchResults.value = [];
  }
};

// Select a search result
const selectSearchResult = (distroId) => {
  selectDistro(distroId);
  searchResults.value = []; // Clear results after selection
  searchQuery.value = ''; // Clear search input
};

// Select a distribution
const selectDistro = async (distroId) => {
  try {
    const data = await apiService.fetchData();
    const distro = data.distros.find(d => d.id === distroId);

    if (distro) {
      selectedDistro.value = distro;
      // Notify the graph component to highlight this node
      // This would require communication between components
      // For now, we'll just update the UI
    }
  } catch (error) {
    console.error('Error selecting distribution:', error);
  }
};

// Get color for distribution based on family
const getDistroColor = (family) => {
  const colors = {
    'Debian': '#a81d33',
    'Red Hat': '#3b65bd',
    'Fedora': '#3b65bd',
    'Arch': '#1793d1',
    'Independent': '#1793d1',
    'SUSE': '#2ab27b',
    'Ubuntu': '#e95420',
    'Android': '#a4c639',
    'ChromeOS': '#4285f4'
  };
  return colors[family] || '#4cc9f0'; // Default cyan
};

// Start auto-research function using Wikipedia API
const startAutoResearch = async () => {
  if (!selectedDistro.value) {
    alert('Please select a distribution first to research');
    return;
  }

  try {
    // Show loading state
    const researchResult = ref({
      loading: true,
      data: null,
      error: null
    });

    // Fetch Wikipedia summary for the selected distribution
    const searchTerm = selectedDistro.value.name.replace(/\s+/g, '_');
    const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchTerm)}`;

    const response = await fetch(wikiUrl, {
      headers: {
        'Api-User-Agent': 'DistroMap/1.0 (https://github.com/lihan/DistroMap)'
      }
    });

    if (!response.ok) {
      // Try alternative search if exact match fails
      const searchResponse = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(selectedDistro.value)}&format=json&origin=*`, {
        headers: {
          'Api-User-Agent': 'DistroMap/1.0 (https://github.com/lihan/DistroMap)'
        }
      });

      const searchData = await searchResponse.json();
      if (searchData.query && searchData.query.search && searchData.query.search.length > 0) {
        const bestMatch = searchData.query.search[0];
        const detailResponse = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(bestMatch.title)}`, {
          headers: {
            'Api-User-Agent': 'DistroMap/1.0 (https://github.com/lihan/DistroMap)'
          }
        });

        if (detailResponse.ok) {
          researchResult.value.data = await detailResponse.json();
        } else {
          throw new Error('Could not find detailed information');
        }
      } else {
        throw new Error('No Wikipedia article found');
      }
    } else {
      researchResult.value.data = await response.json();
    }

    researchResult.value.loading = false;

    // Show results in a modal or update the UI
    if (researchResult.value.data) {
      const modalContent = `
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div class="bg-gray-800 text-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div class="flex justify-between items-start mb-4">
              <h2 class="text-xl font-bold">${researchResult.value.data.title}</h2>
              <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-white">&times;</button>
            </div>
            ${researchResult.value.data.thumbnail ? `<div class="mb-4"><img src="${researchResult.value.data.thumbnail.source}" alt="${researchResult.value.data.title}" class="max-w-full h-auto rounded"></div>` : ''}
            <p class="text-gray-300 leading-relaxed mb-4">${researchResult.value.data.extract || 'No extract available'}</p>
            ${researchResult.value.data.content_urls?.desktop?.page ? `<a href="${researchResult.value.data.content_urls.desktop.page}" target="_blank" class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded">Read full article on Wikipedia</a>` : ''}
          </div>
        </div>
      `;

      // Append to body
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = modalContent;
      document.body.appendChild(tempDiv.firstChild);
    } else {
      alert('No information found for this distribution');
    }
  } catch (error) {
    console.error('Error researching distribution:', error);
    alert('Could not retrieve information from Wikipedia. Please try again later.');
  }
};

// Submit a distribution suggestion
const submitSuggestion = async () => {
  if (!suggestion.topic.trim()) {
    alert('Please enter a distribution name');
    return;
  }

  suggestionSubmitting.value = true;
  suggestionResult.value = null;

  try {
    const result = await apiService.suggestDistribution(
      suggestion.topic,
      suggestion.rationale,
      suggestion.submitter || null
    );

    suggestionResult.value = {
      status: 'success',
      message: `Successfully submitted suggestion for "${suggestion.topic}"! Review ID: ${result.id}`
    };

    // Reset form
    suggestion.topic = '';
    suggestion.rationale = '';
    suggestion.submitter = '';

  } catch (error) {
    console.error('Error submitting suggestion:', error);
    suggestionResult.value = {
      status: 'error',
      message: `Failed to submit suggestion: ${error.message}`
    };
  } finally {
    suggestionSubmitting.value = false;
  }
};

// Find connections between distributions
const findConnections = async () => {
  if (!selectedDistro.value) {
    alert('Please select a distribution first');
    return;
  }

  try {
    // Find paths to some other distributions
    const data = await apiService.fetchData();
    const targetDistros = data.distros
      .filter(d => d.id !== selectedDistro.value.id)
      .slice(0, 3) // Just pick a few for demonstration
      .map(d => d.id);

    const paths = [];
    for (const target of targetDistros) {
      const path = await apiService.findPath(selectedDistro.value.id, target);
      if (path && path.found) {
        paths.push({ from: selectedDistro.value.id, to: target, path });
      }
    }

    if (paths.length > 0) {
      alert(`Found ${paths.length} connection paths! Check console for details.`);
      console.log('Connection paths:', paths);
    } else {
      alert('No connections found to other distributions.');
    }
  } catch (error) {
    console.error('Error finding connections:', error);
    alert('Error finding connections. Please try again.');
  }
};

// Compare with other distributions
const compareWithOthers = async () => {
  if (!selectedDistro.value) {
    alert('Please select a distribution first');
    return;
  }

  try {
    // Select a few other distributions to compare with
    const data = await apiService.fetchData();
    const otherDistros = data.distros
      .filter(d => d.id !== selectedDistro.value.id)
      .slice(0, 3) // Compare with 3 others
      .map(d => d.id);

    const comparison = await apiService.compareDistributions([
      selectedDistro.value.id,
      ...otherDistros
    ]);

    if (comparison.length > 0) {
      alert('Comparison completed! Check console for details.');
      console.log('Comparison results:', comparison);
    } else {
      alert('No comparison data available.');
    }
  } catch (error) {
    console.error('Error comparing distributions:', error);
    alert('Error comparing distributions. Please try again.');
  }
};

// Toggle graph visibility
const toggleGraphVisibility = () => {
  graphVisible.value = !graphVisible.value;
};
</script>

<style>
/* Ensure proper scrolling in sidebars */
aside {
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #3a3a3a #1a1a1a;
}

/* Custom scrollbar for WebKit */
aside::-webkit-scrollbar {
  width: 8px;
}

aside::-webkit-scrollbar-track {
  background: #1a1a1a;
}

aside::-webkit-scrollbar-thumb {
  background-color: #3a3a3a;
  border-radius: 4px;
}

aside::-webkit-scrollbar-thumb:hover {
  background-color: #4a4a4a;
}

/* Animation classes */
.fade-in {
  animation: fadeIn 0.3s ease-in-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Pulse animation for buttons */
.pulse {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
}
</style>