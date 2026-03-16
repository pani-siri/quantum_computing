# SmartLearn — AI Agent Context

## Stack
- Frontend: React+TS, Vite, TailwindCSS → `app/App.tsx` (root), `app/components/`
- Backend: Express.js → `app/server/index.js` (port 5171)
- Auth: localStorage mock (`services/firebaseService.ts`), session in `fb_session`
- AI: OpenRouter API (GPT-4o-mini) for roadmap/content/chat, Groq for fallback
- Quantum ML: Qiskit QSVM (`app/qsvm/`) for cognitive load + mastery classification
- Video: YouTube Data API v3 with duration filter (8min+ only)
- Data: All in localStorage (`fb_users`, `fb_agents`, `fb_tasks`, `fb_schedule`)

## Architecture
```
User → Login → Dashboard (agents list)
         ↓
   Create Agent → AI generates day-by-day roadmap (modules → subtopics)
         ↓
   StudySession → Tabs: Video | Notes | Materials | Practice | Flashcards | Quiz | Chat
         ↓
   Quiz completion → QSVM mastery check → inject Review subtopic if struggling
         ↓
   Final Assessment (30q) when 100% complete
```

## Key Files
| File | Role |
|------|------|
| `App.tsx` | Root: auth, agents CRUD, session handler, modal, roadmap display |
| `components/StudySession.tsx` | Full study session UI, quiz engine, QSVM adaptive triggers |
| `components/FinalAssessmentView.tsx` | 30-question final exam |
| `components/Dashboard.tsx` | Stats/velocity view |
| `components/Planner.tsx` | Schedule calendar view |
| `components/Profile.tsx` | User settings, Gmail connect |
| `server/index.js` | All API routes: auth, AI, QSVM, YouTube, Gmail |
| `services/fastapiService.ts` | Frontend→backend API calls |
| `services/firebaseService.ts` | localStorage CRUD for users/agents/tasks |
| `services/quantumSimulator.ts` | QAOA schedule optimizer + QSVM bridge |
| `services/qsvmFeatureExtractor.ts` | Behavioral metrics → QSVM features |
| `qsvm/predict_qsvm.py` | Python QSVM prediction script |
| `qsvm/model.joblib` | Trained QSVM model |
| `types.ts` | All TypeScript interfaces |

## Data Model
- `LearningAgent`: subject, roadmap (Module[]), progress, cognitive_history
- `Module`: title, subtopics (SubTopic[])
- `SubTopic`: title, day_number, difficulty, is_completed, bundle?, quiz_score?, weak_concepts?, is_review?
- `AcademicBundle`: notes, videos, materials, solved_examples, practice_questions, quiz, flashcards

## API Endpoints (server/index.js)
- `POST /api/auth/*` — register, login, OTP, Google, password reset
- `POST /api/ai/roadmap` — generate study roadmap
- `POST /api/ai/content` — synthesize academic bundle for subtopic
- `POST /api/ai/resource` — regenerate single resource
- `POST /api/qsvm/predict` — cognitive load prediction
- `POST /api/qsvm/mastery` — quiz mastery classification
- `POST /api/tutor/chat` — AI tutor conversation
- `GET/POST /api/gmail/*` — Gmail OAuth + task extraction

## Env Vars (.env.local)
OPENROUTER_API_KEY, YOUTUBE_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, QSVM_PYTHON, GOOGLE_CLIENT_ID/SECRET, OTP_EMAIL_*
