import { useCallback, useEffect, useMemo, useState } from 'react'
import { useUser } from '@clerk/clerk-react'

const SUBSCRIPTION_STORAGE_KEY = 'vfx_pro_subscription_plan'
const ADMIN_OVERRIDE_STORAGE_KEY = 'vfx_pro_admin_override'
const AGE_VERIFIED_STORAGE_KEY = 'vfx_pro_age_verified'
const RESTRICTED_CONSENT_STORAGE_KEY = 'vfx_pro_restricted_consent'
const VERIFICATION_METHOD_STORAGE_KEY = 'vfx_pro_verification_method'
const VERIFICATION_AT_STORAGE_KEY = 'vfx_pro_verified_at'

const PLAN_ORDER = ['free', 'creator', 'pro', 'studio']

const FEATURE_PLAN_REQUIREMENTS = {
    generatorBasic: 'free',
    generatorAdvanced: 'creator',
    generator4k: 'pro',
    generator8k: 'studio',
    sceneEditor: 'pro',
    runtimeBridge: 'pro',
    cinematicRecording: 'studio',
}

const COMPLIANCE_REQUIRED_FEATURES = new Set([
    'generatorAdvanced',
    'generator4k',
    'generator8k',
    'sceneEditor',
    'runtimeBridge',
    'cinematicRecording',
])

export const PLAN_LABELS = {
    free: 'Free',
    creator: 'Creator',
    pro: 'Pro',
    studio: 'Studio',
}

export const ADMIN_TEST_ACCOUNT = {
    name: 'VFX Studios Test Admin',
    email: 'admin@vfxstudios.local',
    password: 'VFX-ADMIN-2026!',
    role: 'admin',
}

function safeLocalStorageRead(key, fallback) {
    if (typeof window === 'undefined') return fallback
    const value = window.localStorage.getItem(key)
    return value == null ? fallback : value
}

function safeLocalStorageWrite(key, value) {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(key, value)
}

function normalizePlan(plan) {
    if (PLAN_ORDER.includes(plan)) return plan
    return 'free'
}

function getPlanRank(plan) {
    return PLAN_ORDER.indexOf(normalizePlan(plan))
}

export function getStoredPlan() {
    return normalizePlan(safeLocalStorageRead(SUBSCRIPTION_STORAGE_KEY, 'free'))
}

export function setStoredPlan(plan) {
    safeLocalStorageWrite(SUBSCRIPTION_STORAGE_KEY, normalizePlan(plan))
}

export function getAdminOverride() {
    return safeLocalStorageRead(ADMIN_OVERRIDE_STORAGE_KEY, '0') === '1'
}

export function setAdminOverride(enabled) {
    safeLocalStorageWrite(ADMIN_OVERRIDE_STORAGE_KEY, enabled ? '1' : '0')
}

export function getAgeVerified() {
    return safeLocalStorageRead(AGE_VERIFIED_STORAGE_KEY, '0') === '1'
}

export function setAgeVerified(enabled) {
    safeLocalStorageWrite(AGE_VERIFIED_STORAGE_KEY, enabled ? '1' : '0')
    if (!enabled) safeLocalStorageWrite(VERIFICATION_AT_STORAGE_KEY, '')
    if (enabled && !safeLocalStorageRead(VERIFICATION_AT_STORAGE_KEY, '')) {
        safeLocalStorageWrite(VERIFICATION_AT_STORAGE_KEY, new Date().toISOString())
    }
}

export function getRestrictedConsentAccepted() {
    return safeLocalStorageRead(RESTRICTED_CONSENT_STORAGE_KEY, '0') === '1'
}

export function setRestrictedConsentAccepted(enabled) {
    safeLocalStorageWrite(RESTRICTED_CONSENT_STORAGE_KEY, enabled ? '1' : '0')
}

export function getVerificationMethod() {
    return safeLocalStorageRead(VERIFICATION_METHOD_STORAGE_KEY, 'unverified')
}

export function setVerificationMethod(method) {
    safeLocalStorageWrite(VERIFICATION_METHOD_STORAGE_KEY, method || 'unverified')
}

export function getVerificationTimestamp() {
    return safeLocalStorageRead(VERIFICATION_AT_STORAGE_KEY, '')
}

export function getRequiredPlanForFeature(featureKey) {
    return FEATURE_PLAN_REQUIREMENTS[featureKey] || 'studio'
}

export function isComplianceRequiredForFeature(featureKey) {
    return COMPLIANCE_REQUIRED_FEATURES.has(featureKey)
}

export function hasPlanAccess(currentPlan, requiredPlan) {
    return getPlanRank(currentPlan) >= getPlanRank(requiredPlan)
}

export function getUserEmail(user) {
    return user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress || null
}

function isUserInAdminAllowlist(user) {
    const email = String(getUserEmail(user) || '').toLowerCase()
    if (!email) return false

    const envList = String(import.meta.env.VITE_ADMIN_ALLOWLIST || '')
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)

    const defaultAllow = ['admin@vfxstudios.local', 'chadh@vfxstudios.com', 'chadh']

    return [...envList, ...defaultAllow].some((entry) => email.includes(entry))
}

export function isAdminUser(user) {
    return getAdminOverride() || isUserInAdminAllowlist(user)
}

export function useAccessControl() {
    const { user } = useUser()
    const [plan, setPlanState] = useState(() => getStoredPlan())
    const [adminOverride, setAdminOverrideState] = useState(() => getAdminOverride())
    const [ageVerified, setAgeVerifiedState] = useState(() => getAgeVerified())
    const [restrictedConsentAccepted, setRestrictedConsentAcceptedState] = useState(() => getRestrictedConsentAccepted())
    const [verificationMethod, setVerificationMethodState] = useState(() => getVerificationMethod())
    const [verifiedAt, setVerifiedAtState] = useState(() => getVerificationTimestamp())

    useEffect(() => {
        const onStorage = (event) => {
            if (!event?.key || event.key === SUBSCRIPTION_STORAGE_KEY) setPlanState(getStoredPlan())
            if (!event?.key || event.key === ADMIN_OVERRIDE_STORAGE_KEY) setAdminOverrideState(getAdminOverride())
            if (!event?.key || event.key === AGE_VERIFIED_STORAGE_KEY) setAgeVerifiedState(getAgeVerified())
            if (!event?.key || event.key === RESTRICTED_CONSENT_STORAGE_KEY) setRestrictedConsentAcceptedState(getRestrictedConsentAccepted())
            if (!event?.key || event.key === VERIFICATION_METHOD_STORAGE_KEY) setVerificationMethodState(getVerificationMethod())
            if (!event?.key || event.key === VERIFICATION_AT_STORAGE_KEY) setVerifiedAtState(getVerificationTimestamp())
        }
        window.addEventListener('storage', onStorage)
        return () => window.removeEventListener('storage', onStorage)
    }, [])

    const updatePlan = useCallback((nextPlan) => {
        const normalized = normalizePlan(nextPlan)
        setStoredPlan(normalized)
        setPlanState(normalized)
    }, [])

    const updateAdminOverride = useCallback((enabled) => {
        setAdminOverride(enabled)
        setAdminOverrideState(enabled)
    }, [])

    const updateAgeVerified = useCallback((enabled) => {
        setAgeVerified(enabled)
        setAgeVerifiedState(enabled)
        setVerifiedAtState(getVerificationTimestamp())
    }, [])

    const updateRestrictedConsentAccepted = useCallback((enabled) => {
        setRestrictedConsentAccepted(enabled)
        setRestrictedConsentAcceptedState(enabled)
    }, [])

    const updateVerificationMethod = useCallback((method) => {
        setVerificationMethod(method)
        setVerificationMethodState(getVerificationMethod())
    }, [])

    const isAdmin = useMemo(() => adminOverride || isUserInAdminAllowlist(user), [adminOverride, user])
    const effectivePlan = isAdmin ? 'studio' : plan
    const isCompliant = useMemo(() => isAdmin || (ageVerified && restrictedConsentAccepted), [isAdmin, ageVerified, restrictedConsentAccepted])

    const hasAccess = useCallback(
        (featureKey) => {
            const requiredPlan = getRequiredPlanForFeature(featureKey)
            if (!hasPlanAccess(effectivePlan, requiredPlan)) return false
            if (isComplianceRequiredForFeature(featureKey) && !isCompliant) return false
            return true
        },
        [effectivePlan, isCompliant]
    )

    const lockReason = useCallback(
        (featureKey) => {
            const requiredPlan = getRequiredPlanForFeature(featureKey)
            if (!hasPlanAccess(effectivePlan, requiredPlan)) return `${PLAN_LABELS[requiredPlan]} subscription required`
            if (isComplianceRequiredForFeature(featureKey) && !isCompliant) {
                return 'Age verification + 18+ restricted-content consent required'
            }
            return null
        },
        [effectivePlan, isCompliant]
    )

    const activateAdminTestingAccount = useCallback(() => {
        updateAdminOverride(true)
        updatePlan('studio')
        updateAgeVerified(true)
        updateRestrictedConsentAccepted(true)
        updateVerificationMethod('admin_override')
    }, [updateAdminOverride, updatePlan, updateAgeVerified, updateRestrictedConsentAccepted, updateVerificationMethod])

    const completeComplianceVerification = useCallback(
        (method = 'manual_review') => {
            updateVerificationMethod(method)
            updateAgeVerified(true)
            updateRestrictedConsentAccepted(true)
        },
        [updateVerificationMethod, updateAgeVerified, updateRestrictedConsentAccepted]
    )

    return {
        plan,
        effectivePlan,
        isAdmin,
        adminOverride,
        ageVerified,
        restrictedConsentAccepted,
        verificationMethod,
        verifiedAt,
        isCompliant,
        userEmail: getUserEmail(user),
        hasAccess,
        lockReason,
        setPlan: updatePlan,
        setAdminOverride: updateAdminOverride,
        setAgeVerified: updateAgeVerified,
        setRestrictedConsentAccepted: updateRestrictedConsentAccepted,
        setVerificationMethod: updateVerificationMethod,
        activateAdminTestingAccount,
        completeComplianceVerification,
    }
}
