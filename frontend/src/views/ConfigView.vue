<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '../services/api'
import { Settings, Save, Sliders, Shield, Clock, Coins } from 'lucide-vue-next'

const loading = ref(true)
const saving = ref(false)
const config = ref({
  mode: 'manual',
  symbols: [] as string[],
  timeframe: '15m',
  leverage: 5,
  riskPerTrade: 1,
  maxDailyLoss: 5,
  maxTradesPerDay: 10,
  minRRR: 1.5,
  analysisInterval: 60
})

const timeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d']
const availableSymbols = [
  'BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'ADA', 'AVAX', 'LINK', 
  'DOT', 'MATIC', 'UNI', 'ATOM', 'LTC', 'BCH', 'NEAR', 'APT',
  'ARB', 'OP', 'INJ', 'SUI'
]

async function fetchConfig() {
  try {
    const res = await api.get('/config')
    if (res.data) {
      config.value = { ...config.value, ...res.data }
    }
  } catch (e) {
    console.error('Error fetching config:', e)
  } finally {
    loading.value = false
  }
}

async function saveConfig() {
  saving.value = true
  try {
    await api.post('/config', config.value)
    alert('Configuration sauvegardée !')
  } catch (e) {
    console.error('Error saving config:', e)
    alert('Erreur lors de la sauvegarde')
  } finally {
    saving.value = false
  }
}

function toggleSymbol(symbol: string) {
  const index = config.value.symbols.indexOf(symbol)
  if (index === -1) {
    config.value.symbols.push(symbol)
  } else {
    config.value.symbols.splice(index, 1)
  }
}

onMounted(fetchConfig)
</script>

<template>
  <div class="p-6 max-w-4xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold text-white flex items-center gap-3">
          <Settings class="w-7 h-7 text-primary-400" />
          Configuration
        </h2>
        <p class="text-dark-400 mt-1">Paramètres du bot de trading</p>
      </div>
      <button @click="saveConfig" :disabled="saving" class="btn-primary flex items-center gap-2">
        <Save class="w-4 h-4" />
        {{ saving ? 'Sauvegarde...' : 'Sauvegarder' }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="glass-card p-8 text-center text-dark-400">
      Chargement de la configuration...
    </div>

    <div v-else class="space-y-6">
      <!-- Mode -->
      <div class="glass-card p-6">
        <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Sliders class="w-5 h-5 text-primary-400" />
          Mode de Trading
        </h3>
        <div class="flex gap-4">
          <label class="flex-1 cursor-pointer">
            <input type="radio" v-model="config.mode" value="manual" class="sr-only peer" />
            <div class="p-4 rounded-xl border-2 border-dark-700 peer-checked:border-primary-500 peer-checked:bg-primary-500/10 transition-all">
              <p class="font-medium text-white">Manuel</p>
              <p class="text-sm text-dark-400">Signaux uniquement, pas d'exécution</p>
            </div>
          </label>
          <label class="flex-1 cursor-pointer">
            <input type="radio" v-model="config.mode" value="auto" class="sr-only peer" />
            <div class="p-4 rounded-xl border-2 border-dark-700 peer-checked:border-primary-500 peer-checked:bg-primary-500/10 transition-all">
              <p class="font-medium text-white">Automatique</p>
              <p class="text-sm text-dark-400">Exécution automatique des trades</p>
            </div>
          </label>
        </div>
      </div>

      <!-- Symbols -->
      <div class="glass-card p-6">
        <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Coins class="w-5 h-5 text-amber-400" />
          Cryptos à trader ({{ config.symbols.length }})
        </h3>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="symbol in availableSymbols"
            :key="symbol"
            @click="toggleSymbol(symbol)"
            :class="config.symbols.includes(symbol) 
              ? 'bg-primary-600 text-white border-primary-500' 
              : 'bg-dark-800 text-dark-300 border-dark-700 hover:border-dark-600'"
            class="px-3 py-1.5 rounded-lg border text-sm font-medium transition-all"
          >
            {{ symbol }}
          </button>
        </div>
      </div>

      <!-- Trading Settings -->
      <div class="glass-card p-6">
        <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Clock class="w-5 h-5 text-cyan-400" />
          Paramètres de Trading
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label class="block text-sm font-medium text-dark-300 mb-2">Timeframe</label>
            <select v-model="config.timeframe" class="input-field">
              <option v-for="tf in timeframes" :key="tf" :value="tf">{{ tf }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-dark-300 mb-2">Levier</label>
            <input type="number" v-model.number="config.leverage" min="1" max="50" class="input-field" />
          </div>
          <div>
            <label class="block text-sm font-medium text-dark-300 mb-2">Intervalle d'analyse (sec)</label>
            <input type="number" v-model.number="config.analysisInterval" min="10" max="300" class="input-field" />
          </div>
          <div>
            <label class="block text-sm font-medium text-dark-300 mb-2">RRR Minimum</label>
            <input type="number" v-model.number="config.minRRR" min="1" max="5" step="0.1" class="input-field" />
          </div>
        </div>
      </div>

      <!-- Risk Management -->
      <div class="glass-card p-6">
        <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Shield class="w-5 h-5 text-emerald-400" />
          Gestion du Risque
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label class="block text-sm font-medium text-dark-300 mb-2">Risque par trade (%)</label>
            <input type="number" v-model.number="config.riskPerTrade" min="0.1" max="10" step="0.1" class="input-field" />
          </div>
          <div>
            <label class="block text-sm font-medium text-dark-300 mb-2">Perte max journalière (%)</label>
            <input type="number" v-model.number="config.maxDailyLoss" min="1" max="20" class="input-field" />
          </div>
          <div>
            <label class="block text-sm font-medium text-dark-300 mb-2">Max trades/jour</label>
            <input type="number" v-model.number="config.maxTradesPerDay" min="1" max="50" class="input-field" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
