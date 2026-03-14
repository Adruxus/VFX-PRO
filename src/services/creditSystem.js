import pricingConfig from '@/config/pricing.json'

const DEFAULT_CREDIT_VALUE = 0.01
const DEFAULT_CHARGE_MULTIPLIER = 3

function findModelEntry(modelId) {
    for (const [tier, models] of Object.entries(pricingConfig.modelCosts || {})) {
        if (models?.[modelId]) {
            return { tier, ...models[modelId] }
        }
    }
    return null
}

export function getCreditUnitValue() {
    const configured = Number(pricingConfig.creditValue)
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_CREDIT_VALUE
}

export function getChargeMultiplier() {
    const configured = Number(pricingConfig.chargeMultiplier)
    if (Number.isFinite(configured) && configured > 0) return configured
    const legacyMarkup = Number(pricingConfig.markup)
    return Number.isFinite(legacyMarkup) && legacyMarkup > 0 ? legacyMarkup : DEFAULT_CHARGE_MULTIPLIER
}

// Legacy export kept for existing callers.
export function getMarkupMultiplier() {
    return getChargeMultiplier()
}

export function getPlanMonthlyCredits(planTier) {
    const credits = Number(pricingConfig.tiers?.[planTier]?.credits)
    return Number.isFinite(credits) && credits >= 0 ? Math.floor(credits) : 0
}

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

function creditsForProviderCost(providerCost) {
    const safeCost = Number(providerCost)
    if (!Number.isFinite(safeCost) || safeCost <= 0) return 0
    const billedUsd = safeCost * getChargeMultiplier()
    const creditValue = getCreditUnitValue()
    return Math.max(1, Math.ceil(billedUsd / creditValue))
}

// Get credit cost for a model
export function getModelCreditCost(modelId) {
    const model = findModelEntry(modelId)
    if (!model) return 0

    const providerCostCredits = creditsForProviderCost(model.providerCost)
    if (providerCostCredits > 0) return providerCostCredits

    const configuredCredits = Number(model.credits)
    if (Number.isFinite(configuredCredits) && configuredCredits > 0) return Math.ceil(configuredCredits)
    return 0
}

// Get model tier
export function getModelTier(modelId) {
    const model = findModelEntry(modelId)
    return model?.tier || 'free'
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

// Get billing profile for a model in credit terms + hidden cost split
export function getModelPricing(modelId) {
    const model = findModelEntry(modelId)
    if (!model) return null

    const providerCost = Number(model.providerCost) || 0
    const chargeMultiplier = getChargeMultiplier()
    const creditValue = getCreditUnitValue()
    let credits = Number(model.credits) || 0
    let billedUsd = credits * creditValue
    let providerReserveUsd = 0

    if (providerCost > 0) {
        billedUsd = providerCost * chargeMultiplier
        credits = Math.max(1, Math.ceil(billedUsd / creditValue))
        providerReserveUsd = providerCost
    } else if (billedUsd > 0 && chargeMultiplier > 0) {
        providerReserveUsd = billedUsd / chargeMultiplier
    }

    const platformProfitUsd = Math.max(0, billedUsd - providerReserveUsd)

    return {
        tier: model.tier,
        credits,
        billedUsd,
        providerCost,
        providerReserveUsd,
        platformProfitUsd,
        chargeMultiplier,
        markup: chargeMultiplier,
    }
}

// Calculate profit margin for a generation
export function calculateMargin(modelId) {
    const pricing = getModelPricing(modelId)
    if (!pricing) return null
    return {
        providerCost: pricing.providerCost,
        yourPrice: pricing.billedUsd,
        profit: pricing.platformProfitUsd,
        margin: pricing.providerCost > 0 ? `${Math.round((pricing.chargeMultiplier - 1) * 100)}%` : null,
    }
}
