<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { Bot, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-vue-next'

const router = useRouter()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')

async function handleLogin() {
  if (!email.value || !password.value) {
    error.value = 'Veuillez remplir tous les champs'
    return
  }
  
  loading.value = true
  error.value = ''
  
  try {
    const result = await auth.login(email.value, password.value)
    if (result.success) {
      router.push('/')
    } else {
      error.value = result.error || 'Erreur de connexion'
    }
  } catch (e: any) {
    error.value = e.response?.data?.error || 'Erreur de connexion au serveur'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <!-- Background effects -->
    <div class="fixed inset-0 overflow-hidden pointer-events-none">
      <div class="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-600/20 rounded-full blur-3xl"></div>
      <div class="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl"></div>
    </div>

    <!-- Login Card -->
    <div class="glass-card w-full max-w-md p-8 animate-scale-in relative z-10">
      <!-- Logo -->
      <div class="flex flex-col items-center mb-8">
        <div class="w-16 h-16 bg-gradient-to-br from-primary-600 to-primary-400 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-primary-500/30">
          <Bot class="w-8 h-8 text-white" />
        </div>
        <h1 class="text-2xl font-bold text-white">Hyperliquid Bot</h1>
        <p class="text-dark-400 text-sm mt-1">Trading automatisé avec Ichimoku</p>
      </div>

      <!-- Error message -->
      <div v-if="error" class="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
        {{ error }}
      </div>

      <!-- Form -->
      <form @submit.prevent="handleLogin" class="space-y-5">
        <!-- Email -->
        <div>
          <label class="block text-sm font-medium text-dark-300 mb-2">Email</label>
          <div class="relative">
            <Mail class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
            <input
              v-model="email"
              type="email"
              placeholder="votre@email.com"
              class="input-field pl-12"
              :disabled="loading"
            />
          </div>
        </div>

        <!-- Password -->
        <div>
          <label class="block text-sm font-medium text-dark-300 mb-2">Mot de passe</label>
          <div class="relative">
            <Lock class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="••••••••"
              class="input-field pl-12 pr-12"
              :disabled="loading"
            />
            <button
              type="button"
              @click="showPassword = !showPassword"
              class="absolute right-4 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300 transition-colors"
            >
              <EyeOff v-if="showPassword" class="w-5 h-5" />
              <Eye v-else class="w-5 h-5" />
            </button>
          </div>
        </div>

        <!-- Submit -->
        <button
          type="submit"
          :disabled="loading"
          class="btn-primary w-full py-3 flex items-center justify-center gap-2"
        >
          <Loader2 v-if="loading" class="w-5 h-5 animate-spin" />
          <span>{{ loading ? 'Connexion...' : 'Se connecter' }}</span>
        </button>
      </form>

      <!-- Footer -->
      <p class="text-center text-dark-500 text-sm mt-6">
        © 2024 Hyperliquid Trading Bot
      </p>
    </div>
  </div>
</template>
