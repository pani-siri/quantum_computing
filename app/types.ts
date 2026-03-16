
export enum Difficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  ADVANCED = 'advanced'
}

export enum CognitiveLoadState {
  LOW = 'LOW_LOAD',
  OPTIMAL = 'OPTIMAL_LOAD',
  HIGH = 'HIGH_LOAD'
}

export enum MasteryState {
  MASTERY = 'Mastery',
  STRUGGLE = 'Struggle',
  NEUTRAL = 'Neutral'
}

export interface AgentStatus {
  id: string;
  name: string;
  status: 'processing' | 'optimizing' | 'negotiating' | 'idle';
  lastAction: string;
}

export interface User {
  uid: string;
  name: string;
  email: string;
  created_at: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

export interface QuizItem {
  question: string;
  options: string[];
  answer: string;
  explanation: string;
}

export interface SubjectiveItem {
  question: string;
  ideal_answer_keywords: string[];
  difficulty: Difficulty;
}

export interface FlashcardItem {
  front: string;
  back: string;
}

export interface VideoItem {
  title: string;
  url: string;
  description: string;
}

export interface MaterialItem {
  title: string;
  url: string;
  type: 'pdf' | 'textbook' | 'lecture-notes' | 'article';
  description: string;
}

export interface SolvedExample {
  problem: string;
  solution: string;
  steps: string[];
}

export interface PracticeQuestion {
  question: string;
  answer: string;
}

export interface AcademicBundle {
  notes: string;
  videos: VideoItem[];
  materials: MaterialItem[];
  solved_examples: SolvedExample[];
  practice_questions: PracticeQuestion[];
  quiz: QuizItem[];
  flashcards: FlashcardItem[];
  detected_load?: CognitiveLoadState;
}

export interface FinalAssessment {
  objective_questions: QuizItem[];
  subjective_questions: SubjectiveItem[];
  is_completed: boolean;
  score?: number;
  feedback?: string;
  weak_areas?: string[];
}

export interface SubTopic {
  id: string;
  module_id: string;
  title: string;
  day_number: number;
  daily_goals: string[]; 
  difficulty: Difficulty;
  is_completed: boolean;
  is_synthesized?: boolean;
  bundle?: AcademicBundle;
  quiz_score?: number;
  weak_concepts?: string[];
  is_review?: boolean;
  review_of?: string;
}

export interface Module {
  id: string;
  agent_id: string;
  title: string;
  description: string;
  subtopics: SubTopic[];
}

export interface LearningAgent {
  id: string;
  user_id: string;
  subject: string;
  timeframe: string;
  syllabus?: string;
  roadmap: Module[];
  progress: number; 
  last_activity: string;
  total_focus_time: number; 
  total_distractions: number;
  chat_history: ChatMessage[];
  cognitive_history: { timestamp: string; state: CognitiveLoadState }[];
  resource_feedback: { resourceId: string; rating: 1 | -1 }[];
  final_assessment?: FinalAssessment;
  custom_preferences: {
    focus_style: 'theoretical' | 'practical' | 'fast-paced';
    quiz_difficulty: Difficulty;
    enable_explanations: boolean;
  };
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  deadline: string;
  priority: 'high' | 'medium' | 'low';
  source: 'Email' | 'WhatsApp' | 'Portal' | 'Manual';
}

export interface ScheduleEvent {
  id: string;
  user_id: string;
  title: string;
  start_time: string;
  end_time: string;
  type: 'study' | 'break' | 'deadline';
  agent_id?: string;
  subtopic_id?: string;
}
