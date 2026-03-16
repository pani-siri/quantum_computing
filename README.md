# QuantumPath — Personalized Learning Scheduler

An AI-powered personalized learning platform that combines **Quantum-inspired algorithms** (QAOA, QSVM) with **Google Gemini AI** to create adaptive study plans with real-time cognitive load monitoring.

## Project Structure

```
Finaly_project/
├── app/                    # Main application
│   ├── components/         # React UI components (Dashboard, StudySession, etc.)
│   ├── services/           # Business logic & API layer (Gemini AI, auth, Gmail, quantum)
│   ├── server/             # Express.js backend (API routes, YouTube search, OTP auth)
│   ├── qaoa/               # QAOA schedule optimization (Python + Qiskit)
│   ├── qsvm/               # Quantum SVM cognitive load detection (Python + Qiskit)
│   ├── App.tsx             # Main React component (routing, auth, state management)
│   ├── types.ts            # TypeScript interfaces & enums
│   ├── index.html          # HTML entry point
│   ├── index.tsx           # React DOM root
│   ├── vite.config.ts      # Vite dev server config
│   ├── package.json        # Node dependencies
│   └── .env.example        # Environment variables template
│
├── docs/                   # Documentation & research
│   ├── papers/             # Reference research papers
│   ├── presentations/      # Project presentations (PPTs)
│   ├── Abstract.pdf
│   ├── Literature Survey.docx
│   ├── Learning Module.pdf
│   └── ...
│
└── README.md
```

## Quick Start

### Frontend (Vite — Port 3000)
```bash
cd app
npm install
npm run dev
```

### Backend (Express — Port 5171)
```bash
cd app
node server/index.js
```

### QSVM Model Training (Python)
```bash
cd app/qsvm
pip install -r requirements.txt
python train_qsvm.py
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Recharts, Lucide Icons |
| Backend | Express.js, Nodemailer, Google APIs |
| AI/ML | Google Gemini AI, Xenova Transformers |
| Quantum | Qiskit, Qiskit-Aer, Qiskit-Optimization |
| Auth | OTP via email, Google OAuth 2.0 |
