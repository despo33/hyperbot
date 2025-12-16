<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import api from '../services/api'
import { 
  History, TrendingUp, TrendingDown, Filter
} from 'lucide-vue-next'

const loading = ref(true)
const trades = ref<any[]>([])
const filter = ref({
  period: 'all',
  result: 'all',
  symbol: 'all'
})

const symbols = computed(() => {
  const unique = [...new Set(trades.value.map(t => t.coin))]
  return unique.sort()
})

const filteredTrades = computed(() => {
  let result = [...trades.value]
  
  if (filter.value.result === 'win') {
    result = result.filter(t => t.pnl > 0)
  } else if (filter.value.result === 'loss') {
    result = result.filter(t => t.pnl < 0)
  }
  
  if (filter.value.symbol !== 'all') {
    result = result.filter(t => t.coin === filter.value.symbol)
  }
  
  return result
})

const stats = computed(() => {
  const wins = filteredTrades.value.filter(t => t.pnl > 0)
  const losses = filteredTrades.value.filter(t => t.pnl < 0)
  const totalPnL = filteredTrades.value.reduce((sum, t) => sum + t.pnl, 0)
  const winRate = filteredTrades.value.length > 0 
    ? (wins.length / filteredTrades.value.length * 100) 
    : 0
  
  return { wins: wins.length, losses: losses.length, totalPnL, winRate }
})

async function fetchTrades() {
  try {
    const res = await api.get('/account/history', { params: filter.value })
    trades.value = res.data.trades || []
  } catch (e) {
    console.error('Error fetching trades:', e)
  } finally {
    loading.value = false
  }
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

onMounted(fetchTrades)
</script>

<template>
  <div class="p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold text-white flex items-center gap-3">
          <History class="w-7 h-7 text-primary-400" />
          Historique des Trades
        </h2>
        <p class="text-dark-400 mt-1">Consultez vos trades passés</p>
      </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div class="stat-card">
        <span class="stat-label">Total Trades</span>
        <span class="stat-value">{{ filteredTrades.length }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Win Rate</span>
        <span class="stat-value text-emerald-400">{{ stats.winRate.toFixed(1) }}%</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Wins / Losses</span>
        <span class="stat-value">
          <span class="text-emerald-400">{{ stats.wins }}</span>
          <span class="text-dark-500"> / </span>
          <span class="text-red-400">{{ stats.losses }}</span>
        </span>
      </div>
      <div class="stat-card">
        <span class="stat-label">P&L Total</span>
        <span class="stat-value" :class="stats.totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'">
          {{ stats.totalPnL >= 0 ? '+' : '' }}${{ stats.totalPnL.toFixed(2) }}
        </span>
      </div>
    </div>

    <!-- Filters -->
    <div class="glass-card p-4 mb-6">
      <div class="flex flex-wrap items-center gap-4">
        <div class="flex items-center gap-2 text-dark-400">
          <Filter class="w-4 h-4" />
          <span class="text-sm font-medium">Filtres:</span>
        </div>
        
        <select v-model="filter.period" @change="fetchTrades" class="input-field w-auto py-2 px-3 text-sm">
          <option value="all">Toutes les périodes</option>
          <option value="today">Aujourd'hui</option>
          <option value="week">Cette semaine</option>
          <option value="month">Ce mois</option>
        </select>
        
        <select v-model="filter.result" class="input-field w-auto py-2 px-3 text-sm">
          <option value="all">Tous les résultats</option>
          <option value="win">Gagnants</option>
          <option value="loss">Perdants</option>
        </select>
        
        <select v-model="filter.symbol" class="input-field w-auto py-2 px-3 text-sm">
          <option value="all">Tous les symboles</option>
          <option v-for="s in symbols" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>
    </div>

    <!-- Trades List -->
    <div class="glass-card overflow-hidden">
      <!-- Loading -->
      <div v-if="loading" class="p-8 text-center text-dark-400">
        Chargement...
      </div>

      <!-- Empty -->
      <div v-else-if="filteredTrades.length === 0" class="p-12 text-center text-dark-400">
        <History class="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>Aucun trade trouvé</p>
      </div>

      <!-- Table -->
      <div v-else class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-dark-800/50 border-b border-dark-700">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-dark-400 uppercase">Date</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-dark-400 uppercase">Symbole</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-dark-400 uppercase">Direction</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-dark-400 uppercase">Entrée</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-dark-400 uppercase">Sortie</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-dark-400 uppercase">P&L</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dark-700">
            <tr 
              v-for="trade in filteredTrades" 
              :key="trade.id"
              class="hover:bg-dark-800/30 transition-colors"
            >
              <td class="px-4 py-4 text-sm text-dark-300">
                {{ formatDate(trade.exitTime) }}
              </td>
              <td class="px-4 py-4">
                <span class="font-medium text-white">{{ trade.coin }}</span>
              </td>
              <td class="px-4 py-4">
                <span 
                  :class="trade.direction === 'long' ? 'badge-success' : 'badge-danger'"
                  class="flex items-center gap-1 w-fit"
                >
                  <TrendingUp v-if="trade.direction === 'long'" class="w-3 h-3" />
                  <TrendingDown v-else class="w-3 h-3" />
                  {{ trade.direction === 'long' ? 'Long' : 'Short' }}
                </span>
              </td>
              <td class="px-4 py-4 text-right font-mono text-sm text-dark-300">
                ${{ trade.entryPrice?.toFixed(2) || '0.00' }}
              </td>
              <td class="px-4 py-4 text-right font-mono text-sm text-dark-300">
                ${{ trade.exitPrice?.toFixed(2) || '0.00' }}
              </td>
              <td class="px-4 py-4 text-right">
                <span 
                  :class="trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'"
                  class="font-mono font-semibold"
                >
                  {{ trade.pnl >= 0 ? '+' : '' }}${{ trade.pnl?.toFixed(2) || '0.00' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
