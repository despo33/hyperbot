<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import api from '../services/api'
import { 
  LayoutDashboard, History, Settings, LogOut, Bot, 
  TrendingUp, TrendingDown, DollarSign, Activity,
  Play, Square, RefreshCw, Wallet, BarChart3
} from 'lucide-vue-next'

const auth = useAuthStore()

// State
const loading = ref(true)
const botStatus = ref<any>(null)
const positions = ref<any[]>([])
const account = ref<any>(null)
const ws = ref<WebSocket | null>(null)

// Computed
const isRunning = computed(() => botStatus.value?.isRunning)
const totalPnL = computed(() => {
  return positions.value.reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0)
})

// Fetch data
async function fetchData() {
  try {
    const [statusRes, positionsRes, accountRes] = await Promise.all([
      api.get('/status'),
      api.get('/positions'),
      api.get('/account')
    ])
    botStatus.value = statusRes.data
    positions.value = positionsRes.data.positions || []
    account.value = accountRes.data
  } catch (e) {
    console.error('Error fetching data:', e)
  } finally {
    loading.value = false
  }
}

// Bot controls
async function toggleBot() {
  try {
    if (isRunning.value) {
      await api.post('/bot/stop')
    } else {
      await api.post('/bot/start')
    }
    await fetchData()
  } catch (e) {
    console.error('Error toggling bot:', e)
  }
}

// WebSocket
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  ws.value = new WebSocket(`${protocol}//${window.location.host}`)
  
  ws.value.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      if (data.type === 'status') {
        botStatus.value = data.data
      } else if (data.type === 'positions') {
        positions.value = data.data || []
      }
    } catch (e) {}
  }
  
  ws.value.onclose = () => {
    setTimeout(connectWebSocket, 3000)
  }
}

async function logout() {
  await auth.logout()
  window.location.href = '/login'
}

onMounted(() => {
  fetchData()
  connectWebSocket()
})

onUnmounted(() => {
  ws.value?.close()
})
</script>

<template>
  <div class="min-h-screen flex">
    <!-- Sidebar -->
    <aside class="w-64 glass-card m-4 mr-0 p-4 flex flex-col">
      <!-- Logo -->
      <div class="flex items-center gap-3 px-2 mb-8">
        <div class="w-10 h-10 bg-gradient-to-br from-primary-600 to-primary-400 rounded-xl flex items-center justify-center">
          <Bot class="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 class="font-bold text-white">HyperBot</h1>
          <p class="text-xs text-dark-400">Trading Bot</p>
        </div>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 space-y-1">
        <router-link to="/" class="flex items-center gap-3 px-4 py-3 rounded-xl text-dark-300 hover:bg-dark-800/50 hover:text-white transition-all" active-class="!bg-primary-600/20 !text-primary-400">
          <LayoutDashboard class="w-5 h-5" />
          <span>Dashboard</span>
        </router-link>
        <router-link to="/trades" class="flex items-center gap-3 px-4 py-3 rounded-xl text-dark-300 hover:bg-dark-800/50 hover:text-white transition-all" active-class="!bg-primary-600/20 !text-primary-400">
          <History class="w-5 h-5" />
          <span>Historique</span>
        </router-link>
        <router-link to="/config" class="flex items-center gap-3 px-4 py-3 rounded-xl text-dark-300 hover:bg-dark-800/50 hover:text-white transition-all" active-class="!bg-primary-600/20 !text-primary-400">
          <Settings class="w-5 h-5" />
          <span>Configuration</span>
        </router-link>
      </nav>

      <!-- User -->
      <div class="border-t border-dark-700 pt-4 mt-4">
        <button @click="logout" class="flex items-center gap-3 px-4 py-3 rounded-xl text-dark-400 hover:bg-red-500/10 hover:text-red-400 transition-all w-full">
          <LogOut class="w-5 h-5" />
          <span>Déconnexion</span>
        </button>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 p-4 overflow-auto">
      <!-- Header -->
      <header class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-2xl font-bold text-white">Dashboard</h2>
          <p class="text-dark-400">Vue d'ensemble de votre trading</p>
        </div>
        <div class="flex items-center gap-3">
          <button @click="fetchData" class="btn-secondary flex items-center gap-2">
            <RefreshCw class="w-4 h-4" />
            Actualiser
          </button>
          <button @click="toggleBot" :class="isRunning ? 'btn-danger' : 'btn-success'" class="flex items-center gap-2">
            <Square v-if="isRunning" class="w-4 h-4" />
            <Play v-else class="w-4 h-4" />
            {{ isRunning ? 'Arrêter' : 'Démarrer' }}
          </button>
        </div>
      </header>

      <!-- Loading -->
      <div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div v-for="i in 4" :key="i" class="stat-card">
          <div class="skeleton h-4 w-20 mb-2"></div>
          <div class="skeleton h-8 w-32"></div>
        </div>
      </div>

      <!-- Stats -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <!-- Bot Status -->
        <div class="stat-card">
          <div class="flex items-center justify-between">
            <span class="stat-label">Statut Bot</span>
            <Activity class="w-5 h-5 text-primary-400" />
          </div>
          <div class="flex items-center gap-2">
            <span :class="isRunning ? 'bg-emerald-500' : 'bg-dark-500'" class="w-2 h-2 rounded-full"></span>
            <span class="stat-value text-xl">{{ isRunning ? 'Actif' : 'Arrêté' }}</span>
          </div>
        </div>

        <!-- Balance -->
        <div class="stat-card">
          <div class="flex items-center justify-between">
            <span class="stat-label">Balance</span>
            <Wallet class="w-5 h-5 text-cyan-400" />
          </div>
          <span class="stat-value">${{ (account?.balance || 0).toFixed(2) }}</span>
        </div>

        <!-- P&L -->
        <div class="stat-card">
          <div class="flex items-center justify-between">
            <span class="stat-label">P&L Non réalisé</span>
            <DollarSign class="w-5 h-5" :class="totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'" />
          </div>
          <span class="stat-value" :class="totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'">
            {{ totalPnL >= 0 ? '+' : '' }}${{ totalPnL.toFixed(2) }}
          </span>
        </div>

        <!-- Positions -->
        <div class="stat-card">
          <div class="flex items-center justify-between">
            <span class="stat-label">Positions</span>
            <BarChart3 class="w-5 h-5 text-amber-400" />
          </div>
          <span class="stat-value">{{ positions.length }}</span>
        </div>
      </div>

      <!-- Positions -->
      <div class="glass-card p-6">
        <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <TrendingUp class="w-5 h-5 text-primary-400" />
          Positions Ouvertes
        </h3>

        <div v-if="positions.length === 0" class="text-center py-12 text-dark-400">
          <BarChart3 class="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Aucune position ouverte</p>
        </div>

        <div v-else class="space-y-3">
          <div 
            v-for="pos in positions" 
            :key="pos.symbol"
            class="flex items-center justify-between p-4 bg-dark-800/50 rounded-xl border border-dark-700 hover:border-primary-500/30 transition-all"
          >
            <div class="flex items-center gap-4">
              <div :class="pos.size > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'" class="w-10 h-10 rounded-lg flex items-center justify-center">
                <TrendingUp v-if="pos.size > 0" class="w-5 h-5" />
                <TrendingDown v-else class="w-5 h-5" />
              </div>
              <div>
                <p class="font-semibold text-white">{{ pos.symbol }}</p>
                <p class="text-sm text-dark-400">
                  {{ pos.size > 0 ? 'Long' : 'Short' }} · {{ Math.abs(pos.size).toFixed(4) }}
                </p>
              </div>
            </div>
            <div class="text-right">
              <p :class="pos.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'" class="font-mono font-semibold">
                {{ pos.unrealizedPnl >= 0 ? '+' : '' }}${{ pos.unrealizedPnl?.toFixed(2) || '0.00' }}
              </p>
              <p class="text-sm text-dark-400">
                Entry: ${{ pos.entryPrice?.toFixed(2) }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
