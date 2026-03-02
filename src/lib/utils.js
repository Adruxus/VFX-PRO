import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// â”€â”€ Class name merger (Tailwind + clsx)
export function cn(...inputs) {
    return twMerge(clsx(inputs))
}

// â”€â”€ Format currency
export function formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

// â”€â”€ Format number with commas
export function formatNumber(n) {
    return new Intl.NumberFormat('en-US').format(n)
}

// â”€â”€ Format date
export function formatDate(date, opts = {}) {
    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', ...opts,
    }).format(new Date(date))
}

// â”€â”€ Format relative time (e.g. "2 hours ago")
export function timeAgo(date) {
    const seconds = Math.floor((Date.now() - new Date(date)) / 1000)
    const intervals = [
        { label: 'year', secs: 31536000 },
        { label: 'month', secs: 2592000 },
        { label: 'week', secs: 604800 },
        { label: 'day', secs: 86400 },
        { label: 'hour', secs: 3600 },
        { label: 'minute', secs: 60 },
    ]
    for (const { label, secs } of intervals) {
        const count = Math.floor(seconds / secs)
        if (count >= 1) return `${count} ${label}${count > 1 ? 's' : ''} ago`
    }
    return 'just now'
}

// â”€â”€ Truncate string
export function truncate(str, maxLen = 50) {
    if (!str) return ''
    return str.length > maxLen ? str.slice(0, maxLen) + '...' : str
}

// â”€â”€ Capitalize first letter
export function capitalize(str) {
    if (!str) return ''
    return str.charAt(0).toUpperCase() + str.slice(1)
}

// â”€â”€ Slugify string
export function slugify(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// â”€â”€ Generate random ID
export function generateId(length = 8) {
    return Math.random().toString(36).substring(2, 2 + length)
}

// â”€â”€ Debounce function
export function debounce(fn, delay = 300) {
    let timer
    return (...args) => {
        clearTimeout(timer)
        timer = setTimeout(() => fn(...args), delay)
    }
}

// â”€â”€ Throttle function
export function throttle(fn, limit = 300) {
    let inThrottle
    return (...args) => {
        if (!inThrottle) {
            fn(...args)
            inThrottle = true
            setTimeout(() => { inThrottle = false }, limit)
        }
    }
}

// â”€â”€ Deep clone object
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj))
}

// â”€â”€ Check if value is empty
export function isEmpty(val) {
    if (val === null || val === undefined) return true
    if (typeof val === 'string') return val.trim().length === 0
    if (Array.isArray(val)) return val.length === 0
    if (typeof val === 'object') return Object.keys(val).length === 0
    return false
}

// â”€â”€ Clamp number between min and max
export function clamp(num, min, max) {
    return Math.min(Math.max(num, min), max)
}

// â”€â”€ Format file size
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// â”€â”€ Format duration in seconds to mm:ss
export function formatDuration(seconds) {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
}

// â”€â”€ Get initials from name
export function getInitials(name) {
    if (!name) return '?'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

// â”€â”€ Validate email
export function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// â”€â”€ Copy text to clipboard
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text)
        return true
    } catch {
        return false
    }
}

// â”€â”€ Download file from URL
export function downloadFile(url, filename) {
    const a = document.createElement('a')
    a.href = url
    a.download = filename || 'download'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
}

// â”€â”€ Parse URL query params
export function parseQueryParams(search = window.location.search) {
    return Object.fromEntries(new URLSearchParams(search))
}

// â”€â”€ Build URL query string
export function buildQueryString(params) {
    return new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== null && v !== undefined)
    ).toString()
}

// â”€â”€ Local storage helpers (with JSON support)
export const storage = {
    get: (key, fallback = null) => {
        try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
    },
    set: (key, value) => {
        try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
    },
    remove: (key) => { try { localStorage.removeItem(key) } catch {} },
    clear: () => { try { localStorage.clear() } catch {} },
}

// â”€â”€ Sleep / delay
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// â”€â”€ Retry async function
export async function retry(fn, attempts = 3, delay = 1000) {
    for (let i = 0; i < attempts; i++) {
        try { return await fn() } catch (err) {
            if (i === attempts - 1) throw err
            await sleep(delay * (i + 1))
        }
    }
}

// â”€â”€ Calculate percentage
export function percentage(value, total) {
    if (!total) return 0
    return Math.round((value / total) * 100)
}

// â”€â”€ Group array by key
export function groupBy(arr, key) {
    return arr.reduce((acc, item) => {
        const group = item[key]
        if (!acc[group]) acc[group] = []
        acc[group].push(item)
        return acc
    }, {})
}

// â”€â”€ Sort array of objects by key
export function sortBy(arr, key, dir = 'asc') {
    return [...arr].sort((a, b) => {
        if (a[key] < b[key]) return dir === 'asc' ? -1 : 1
        if (a[key] > b[key]) return dir === 'asc' ? 1 : -1
        return 0
    })
}

// â”€â”€ Unique array values
export function unique(arr, key) {
    if (!key) return [...new Set(arr)]
    const seen = new Set()
    return arr.filter(item => {
        const val = item[key]
        if (seen.has(val)) return false
        seen.add(val)
        return true
    })
}

// â”€â”€ Chunk array into pages
export function chunk(arr, size) {
    const chunks = []
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size))
    }
    return chunks
}

// â”€â”€ Color helpers
export function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
    } : null
}

// â”€â”€ Credit cost display
export function formatCredits(credits) {
    if (credits >= 1000) return `${(credits / 1000).toFixed(1)}K`
    return credits.toString()
}

// â”€â”€ Tier badge color
export function getTierColor(tier) {
    const colors = {
        free: 'bg-slate-600/20 text-slate-400 border-slate-500/30',
        budget: 'bg-green-600/20 text-green-400 border-green-500/30',
        standard: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
        premium: 'bg-purple-600/20 text-purple-400 border-purple-500/30',
        ultra: 'bg-pink-600/20 text-pink-400 border-pink-500/30',
    }
    return colors[tier] || colors.free
}

// â”€â”€ Plan badge color
export function getPlanColor(plan) {
    const colors = {
        free: 'bg-slate-600/20 text-slate-400',
        creator: 'bg-violet-600/20 text-violet-400',
        pro: 'bg-purple-600/20 text-purple-400',
        studio: 'bg-pink-600/20 text-pink-400',
    }
    return colors[plan] || colors.free
}