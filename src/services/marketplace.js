import axios from 'axios'

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'https://api.vjstudio.pro',
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
})

export const browseAssets = (p) => api.get('/marketplace/assets', { params: p }).then(r => r.data)
export const getAsset = (id) => api.get(`/marketplace/assets/${id}`).then(r => r.data)
export const purchaseAsset = (id, pm) => api.post('/marketplace/purchase', { asset_id: id, payment_method_id: pm }).then(r => r.data)
export const listForSale = (fd) => api.post('/marketplace/list', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
export const createPaymentIntent = (amt) => api.post('/payments/intent', { amount: amt }).then(r => r.data.client_secret)
export const createSubscription = (pid) => api.post('/payments/subscribe', { price_id: pid }).then(r => r.data)
export const getInvoices = () => api.get('/payments/invoices').then(r => r.data)

export default api