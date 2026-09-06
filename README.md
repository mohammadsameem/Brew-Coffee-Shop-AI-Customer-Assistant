# Brew Coffee Shop — AI Customer Assistant

A production-ready, authenticated AI agent for a coffee shop, built for the
Google Cloud "Accelerate AI with Cloud Run" Ideathon (Track 1: Build and
Deploy a Customer-Facing AI Agent).

Customers sign in, chat with an AI assistant grounded in the shop's real
menu/hours/policies, place orders, and track loyalty rewards — all backed by
Firebase Auth, Firestore, and the Gemini API, running on Cloud Run.

---

## Features

- **Google Sign-In** — Firebase Authentication gates the entire app; no
  anonymous access to chat or ordering.
- **Grounded AI chat** — Gemini answers questions using a lightweight
  retrieval step over a local knowledge base (menu, hours, locations,
  policies, FAQs), so it doesn't invent prices or hours.
- **Quick Order + Cart** — browse the live menu with photos, add items with
  one tap, see a running total, and place an order.
- **Loyalty tracker** — a progress bar shows drinks ordered toward "buy 9,
  get the 10th free," calculated from real order history in Firestore.
- **Personalized greeting** — returning customers get a short AI-written
  greeting referencing their most-ordered item.
- **Voice input** — a mic button transcribes speech into the chat box using
  the browser's Web Speech API.
- **Dark mode** — toggle in the header, preference saved locally.
- **Feedback on replies** — thumbs up/down on each AI response.

---

## Architecture

| Layer | Technology |
|---|---|
| Frontend | Plain HTML / CSS / JavaScript |
| Backend | Node.js + Express |
| Auth | Firebase Authentication (Google provider) |
| Database | Firestore |
| AI | Gemini API (Google AI Studio) via `@google/genai` |
| Hosting | Google Cloud Run (deployed via Cloud Buildpacks — no Dockerfile required) |
| Secrets | Gemini API key injected via Google Cloud Secret Manager |

```
public/
  index.html          Frontend markup
  app.js              Auth, chat, cart, loyalty, voice input, dark mode logic
  style.css           Styling (light + dark theme)
  firebase-config.js  Firebase web config (safe to expose — not a secret)
data/
  knowledge.json      Menu, hours, locations, policies, FAQs (RAG source)
server.js             Express backend: auth verification, chat, orders,
                       loyalty, greeting, menu endpoints
firestore.rules       Per-user data isolation rules
package.json
README.md
```

---

## API Endpoints

| Endpoint | Method | Auth required | Purpose |
|---|---|---|---|
| `/api/chat` | POST | Yes | Sends a message to Gemini, grounded in knowledge base + recent history |
| `/api/history` | GET | Yes | Returns the user's chat history |
| `/api/menu` | GET | No | Returns the current menu |
| `/api/orders` | POST | Yes | Places an order, saves it to Firestore |
| `/api/orders` | GET | Yes | Returns the user's past orders |
| `/api/loyalty` | GET | Yes | Returns loyalty progress toward a free drink |
| `/api/greeting` | GET | Yes | Returns a personalized or first-time greeting |
| `/healthz` | GET | No | Health check for Cloud Run |

---

## Data Model (Firestore)

```
users/{uid}/messages/{messageId}   — chat turns (role, text, timestamp)
users/{uid}/orders/{orderId}       — items[], total, timestamp
```

All documents are scoped under the authenticated user's UID. Security rules
deny all access by default and only allow a user to read/write their own
subcollections:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
    match /users/{userId}/messages/{messageId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /users/{userId}/orders/{orderId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

## Setup & Deployment

### 1. Prerequisites
- A Google Cloud project with billing enabled
- `gcloud` CLI installed and authenticated
- A Firebase project linked to the same GCP project

```bash
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com firestore.googleapis.com \
  secretmanager.googleapis.com cloudbuild.googleapis.com \
  identitytoolkit.googleapis.com
```

### 2. Firebase setup
1. In the [Firebase Console](https://console.firebase.google.com), enable
   **Authentication → Sign-in method → Google**.
2. Create a **Firestore** database in production mode.
3. Under **Project settings → General → Your apps**, register a web app and
   copy the config into `public/firebase-config.js`.
4. Deploy the security rules above via the Firestore Rules tab or the
   Firebase CLI (`firebase deploy --only firestore:rules`).

### 3. Gemini API key
1. Get a key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Store it in Secret Manager instead of a plain env file:

```bash
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets create gemini-api-key \
  --data-file=- --replication-policy=automatic
```

### 4. Deploy to Cloud Run

No Firebase project values are hardcoded anywhere in this repo. The server
reads them from environment variables and generates `/firebase-config.js`
dynamically at runtime — so nothing project-identifying is ever committed to
git or exposed in source control.

```bash
gcloud run deploy brew-coffee-agent \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets=GEMINI_API_KEY=gemini-api-key:latest \
  --set-env-vars=FIREBASE_API_KEY="YOUR_FIREBASE_API_KEY",FIREBASE_AUTH_DOMAIN="YOUR_PROJECT_ID.firebaseapp.com",FIREBASE_PROJECT_ID="YOUR_FIREBASE_PROJECT_ID",FIREBASE_STORAGE_BUCKET="YOUR_PROJECT_ID.firebasestorage.app",FIREBASE_MESSAGING_SENDER_ID="YOUR_MESSAGING_SENDER_ID",FIREBASE_APP_ID="YOUR_FIREBASE_APP_ID",FIRESTORE_DATABASE_ID="YOUR_FIRESTORE_DATABASE_ID"
```

Find these values in the Firebase Console under **Project settings → General
→ Your apps**. None of them are secret in the sense of granting write access
(Firestore security rules do that job), but keeping them out of git avoids
GitHub's secret scanning flagging the API key pattern and avoids
fingerprinting your specific Google Cloud project in a public repo.

- `--allow-unauthenticated` makes the **URL** publicly reachable — app-level
  access is still gated by Firebase Sign-In inside the app itself. This is
  the standard "public URL, authenticated features" pattern.
- No Dockerfile is needed; Cloud Run's buildpacks detect Node.js from
  `package.json` and run `npm start`.

### 5. Grant the service account access to the secret (if not automatic)

```bash
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format='value(projectNumber)')
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## Local development

```bash
npm install
cp .env.example .env
# fill in GEMINI_API_KEY and the FIREBASE_* values from your Firebase project
npm start
```

Then open `http://localhost:8080`.

---

## Notes on security

- All chat and ordering endpoints require a valid Firebase ID token, verified
  server-side on every request.
- Firestore rules deny all access by default and only permit a user to touch
  their own `messages` and `orders` subcollections.
- The Gemini API key is never present in client code or the Git history —
  it's injected at runtime from Secret Manager.

## License

Built for the Google Cloud Ideathon. Feel free to fork and adapt for your
own coffee shop (or any small business) use case.
