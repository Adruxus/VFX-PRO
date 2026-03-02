import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '../src/App.jsx'
import '../src/index.css'
import { Clerk } from '@clerk/clerk-js'

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

const {isSignedIn, load, mountSignIn, mountUserButton} = new Clerk(clerkPubKey)
await load()

if (isSignedIn) {
    document.getElementById('app').innerHTML = `
    <div id="user-button"></div>
  `

    const userButtonDiv = document.getElementById('user-button')

    mountUserButton(userButtonDiv)
} else {
    document.getElementById('app').innerHTML = `
    <div id="sign-in"></div>
  `

    const signInDiv = document.getElementById('sign-in')

    mountSignIn(signInDiv)
}
const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const clerk = new Clerk(publishableKey);
await clerk.load({
    // Set load options here
});
ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
