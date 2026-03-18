# Watheeq AI

A web app for insurance claims with three portals: **Claimant**, **Claims Examiner**, and **Admin**. Built with Next.js, FastAPI, Firebase, and Authintica SMS for OTP.

## Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.10+
- **Firebase** project ([console.firebase.google.com](https://console.firebase.google.com))
- **Authintica** account for SMS OTP ([authentica.sa](https://authentica.sa))

## Project Structure

```
watheeq-ai/
├── frontend/     # Next.js + TypeScript + Tailwind
├── backend/      # FastAPI
├── firebase/     # Firestore rules and config
└── shared/       # Shared types and docs
```

## Getting Started

### 1. Clone and enter the repo

```bash
git clone <repo-url>
cd Watheeq-AI
```

### 2. Frontend setup

```bash
cd frontend
npm install
```

Create `frontend/.env.local` with your Firebase config:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Run the dev server:

```bash
npm run dev
```

Frontend: [http://localhost:3000](http://localhost:3000)

### 3. Backend setup

```bash
cd backend
python -m venv venv
source venv/bin/activate   # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create `backend/.env`:

```env
FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=
AUTHINTICA_API_KEY=
AUTHINTICA_API_URL=
```

Run the API server:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend: [http://localhost:8000](http://localhost:8000)

### 4. Firebase setup

1. Create a Firebase project and enable Auth and Firestore.
2. Add a web app and copy the config into `frontend/.env.local`.
3. For the backend, create a service account and download the JSON. Use its `project_id`, `private_key`, and `client_email` in `backend/.env`.
4. Deploy rules (optional): `firebase deploy --only firestore:rules` from the `firebase/` directory.

## Scripts

| Location   | Command        | Description              |
|-----------|----------------|--------------------------|
| frontend/ | `npm run dev`  | Start Next.js dev server |
| frontend/ | `npm run build`| Build for production     |
| frontend/ | `npm run start`| Run production build     |
| backend/  | `uvicorn app.main:app --reload` | Start FastAPI dev server |

## Environment Variables

| Variable | Location | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_FIREBASE_*` | frontend/.env.local | Firebase client config |
| `NEXT_PUBLIC_API_URL` | frontend/.env.local | Backend API base URL |
| `FIREBASE_PROJECT_ID` | backend/.env | Firebase project ID |
| `FIREBASE_PRIVATE_KEY` | backend/.env | Service account private key |
| `FIREBASE_CLIENT_EMAIL` | backend/.env | Service account email |
| `AUTHINTICA_API_KEY` | backend/.env | Authintica SMS API key |
| `AUTHINTICA_API_URL` | backend/.env | Authintica API endpoint |

## Docs

- [Architecture](shared/docs/architecture.md)
- [Cursor project guide](.cursor/rules/watheeq-project.mdc)
