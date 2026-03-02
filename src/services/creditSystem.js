import pricingConfig from '@/config/pricing.json'

// Get user's current plan tier
export function getUserTier(user) {
    return user?.plan || 'free'
}

// Check if user can use a specific model
export function canUseModel(userTier, modelTier) {
    const plan = pricingConfig.tiers[userTier]
    if (!plan) return false
    return plan.allowedTiers.includes(modelTier)
}

// Get credit cost for a model
export function getModelCreditCost(modelId) {
    for (const tier of Object.values(pricingConfig.modelCosts)) {
        if (tier[modelId]) return tier[modelId].credits
    }
    return 0
}

// Get model tier
export function getModelTier(modelId) {
    for (const [tier, models] of Object.entries(pricingConfig.modelCosts)) {
        if (models[modelId]) return tier
    }
    return 'free'
}

// Check if user has enough credits
export function hasEnoughCredits(balance, modelId) {
    const cost = getModelCreditCost(modelId)
    return balance >= cost
}

// Get available models for user's tier
export function getAvailableModels(userTier) {
    const plan = pricingConfig.tiers[userTier]
    if (!plan) return []
    const available = []
    for (const tier of plan.allowedTiers) {
        const models = pricingConfig.modelCosts[tier]
        if (models) {
            for (const [id, info] of Object.entries(models)) {
                available.push({ id, tier, ...info })
            }
        }
    }
    return available
}

// Get all credit packs
export function getCreditPacks() {
    return pricingConfig.creditPacks
}

// Get plan details
export function getPlan(tier) {
    return pricingConfig.tiers[tier]
}

// Get all plans
export function getAllPlans() {
    return Object.entries(pricingConfig.tiers).map(([id, plan]) => ({ id, ...plan }))
}

// Calculate profit margin for a generation
export function calculateMargin(modelId) {
    for (const tier of Object.values(pricingConfig.modelCosts)) {
        if (tier[modelId]) {
            const { providerCost, yourPrice } = tier[modelId]
            return { providerCost, yourPrice, profit: yourPrice - providerCost, margin: tier[modelId].margin }
        }
    }
    return null
}