
import { GoogleGenAI, Type } from "@google/genai";
import { Module, ChatMessage, AcademicBundle, Difficulty, CognitiveLoadState, FinalAssessment, QuizItem, SubjectiveItem } from "../types";

const getAI = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY });

export const generateRoadmap = async (subject: string, timeframe: string, syllabus?: string): Promise<Module[]> => {
  const ai = getAI();
  const prompt = `
    Act as an Academic expert. Create a beginner-friendly, DAY-BY-DAY study plan for: "${subject}". 
    Total Duration: ${timeframe}. 
    Details: ${syllabus || 'Standard mastery path'}.

    STRICT PLAN RULES:
    1. CONSECUTIVE DAYS: Provide lessons for EVERY SINGLE DAY. No gaps.
    2. PROGRESSION: Follow a 4-stage flow: Foundations, Core Concepts, Practice, Mastery.
    3. BREAKDOWN: Break large subjects into smaller focused daily lessons.
    4. CLEAR GOALS: Give each lesson 2-3 specific achievable daily_goals.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            subtopics: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  title: { type: Type.STRING },
                  day_number: { type: Type.INTEGER },
                  daily_goals: { type: Type.ARRAY, items: { type: Type.STRING } },
                  difficulty: { type: Type.STRING, enum: ['easy', 'medium', 'advanced'] }
                },
                required: ['id', 'title', 'day_number', 'difficulty', 'daily_goals']
              }
            }
          },
          required: ['id', 'title', 'subtopics', 'description']
        }
      }
    }
  });

  try {
    const parsed = JSON.parse(response.text || '[]');
    return parsed.map((m: any) => ({
      ...m,
      subtopics: m.subtopics
        .map((s: any) => ({ ...s, is_completed: false, is_synthesized: false }))
        .sort((a: any, b: any) => a.day_number - b.day_number)
    }));
  } catch (e) {
    return [];
  }
};

export const generateFinalAssessment = async (subject: string, syllabus: string): Promise<FinalAssessment> => {
  const ai = getAI();
  const prompt = `
    Generate a rigorous FINAL MASTERY ASSESSMENT for the course: "${subject}".
    Context/Syllabus: ${syllabus}.
    
    REQUIREMENTS:
    1. 20 OBJECTIVE QUESTIONS (Multiple Choice). High difficulty.
    2. 10 SUBJECTIVE QUESTIONS (Open-ended). Require critical thinking and application.
    3. Ensure total questions = 30.
    4. Return valid JSON.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          objective_questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                answer: { type: Type.STRING },
                explanation: { type: Type.STRING }
              },
              required: ['question', 'options', 'answer', 'explanation']
            }
          },
          subjective_questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                ideal_answer_keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                difficulty: { type: Type.STRING }
              },
              required: ['question', 'ideal_answer_keywords']
            }
          }
        },
        required: ['objective_questions', 'subjective_questions']
      }
    }
  });

  const parsed = JSON.parse(response.text || '{}');
  return {
    ...parsed,
    is_completed: false
  };
};

export const evaluateFinalAssessment = async (
  subject: string,
  objectiveResults: { question: string, score: number }[],
  subjectiveAnswers: { question: string, answer: string }[]
): Promise<{ score: number, feedback: string, weak_areas: string[] }> => {
  const ai = getAI();
  const prompt = `
    Evaluate a student's final mastery assessment for "${subject}".
    Objective Score Details: ${JSON.stringify(objectiveResults)}
    Subjective Answers provided by student: ${JSON.stringify(subjectiveAnswers)}
    
    Analyze the subjective answers for depth and keyword presence. 
    Calculate a final combined score out of 100.
    Identify 3 specific weak areas (nodes) that need review.
    Provide constructive neural feedback in a plain text format without markdown symbols.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.INTEGER },
          feedback: { type: Type.STRING },
          weak_areas: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ['score', 'feedback', 'weak_areas']
      }
    }
  });

  return JSON.parse(response.text || '{}');
};

export const synthesizeSubtopicContent = async (
  subject: string, 
  subtopicTitle: string, 
  cognitiveLoad: CognitiveLoadState = CognitiveLoadState.OPTIMAL
): Promise<{ bundle: AcademicBundle, citations: any[], error?: string }> => {
  const ai = getAI();
  
  let adaptationInstruction = "";
  if (cognitiveLoad === CognitiveLoadState.HIGH) {
    adaptationInstruction = `DETECTED: HIGH COGNITIVE LOAD. Use simple analogies. Break technical content into small, digestible logic steps.`;
  } else if (cognitiveLoad === CognitiveLoadState.LOW) {
    adaptationInstruction = `DETECTED: LOW COGNITIVE LOAD. Increase technical depth. Include complex derivations and advanced proofs.`;
  }

  const prompt = `
    Generate a comprehensive academic learning bundle for the topic: "${subtopicTitle}" in the subject area of "${subject}".
    
    ${adaptationInstruction}

    STRICT FORMATTING RULES:
    1. DO NOT USE MARKDOWN SYMBOLS. No hashtags (#), no asterisks (*), no underscores (_), no triple backticks, no dashes (-) for horizontal rules.
    2. USE PLAIN CAPITAL HEADERS for sections (e.g., "CORE CONCEPTS:").
    3. USE "•" or "1." for lists.
    4. ENSURE the "notes" and "answer" fields look structured in PLAIN TEXT.

    STRICT CONTENT REQUIREMENTS:
    1. SEARCH FOR VIDEOS: Find 3 relevant and high-quality YouTube videos for "${subtopicTitle}".
    2. FIND DOCUMENTS: Find 3 REAL, DIRECTLY READABLE external links specifically for "${subtopicTitle}" using googleSearch.
    3. SOLVED EXAMPLES: Create 3 multi-step problems.
    4. PRACTICE QUESTIONS: Create 5 challenging questions. The "answer" must be structured with headers: "OBJECTIVE:", "LOGIC:", "FINAL ANSWER:".
    5. DETAILED NOTES: Provide 800+ words of lesson content. Use plain text formatting only.
    6. QUIZ: 20 Multiple Choice Questions.
    7. FLASHCARDS: 20 recall items.

    MANDATORY: Return the result strictly as a valid JSON object.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            notes: { type: Type.STRING },
            videos: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { title: { type: Type.STRING }, url: { type: Type.STRING }, description: { type: Type.STRING } },
                required: ['title', 'url', 'description']
              }
            },
            materials: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { 
                  title: { type: Type.STRING }, 
                  url: { type: Type.STRING }, 
                  type: { type: Type.STRING, enum: ['pdf', 'textbook', 'lecture-notes', 'article'] }, 
                  description: { type: Type.STRING } 
                },
                required: ['title', 'url', 'type', 'description']
              }
            },
            solved_examples: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { 
                  problem: { type: Type.STRING }, 
                  solution: { type: Type.STRING }, 
                  steps: { type: Type.ARRAY, items: { type: Type.STRING } } 
                },
                required: ['problem', 'solution', 'steps']
              }
            },
            practice_questions: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  answer: { type: Type.STRING }
                },
                required: ['question', 'answer']
              } 
            },
            quiz: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { 
                  question: { type: Type.STRING }, 
                  options: { type: Type.ARRAY, items: { type: Type.STRING } }, 
                  answer: { type: Type.STRING }, 
                  explanation: { type: Type.STRING } 
                },
                required: ['question', 'options', 'answer', 'explanation']
              }
            },
            flashcards: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { front: { type: Type.STRING }, back: { type: Type.STRING } },
                required: ['front', 'back']
              }
            }
          },
          required: ['notes', 'videos', 'materials', 'solved_examples', 'practice_questions', 'quiz', 'flashcards']
        }
      }
    });

    const bundle: AcademicBundle = JSON.parse(response.text || '{}');
    bundle.detected_load = cognitiveLoad;
    return { bundle, citations: response.candidates?.[0]?.groundingMetadata?.groundingChunks || [] };
  } catch (e) {
    console.error("Synthesis failed:", e);
    return { 
      bundle: { 
        notes: "Synthesis node failed. Retrying with basic parameters...", 
        videos: [], materials: [], solved_examples: [], practice_questions: [], quiz: [], flashcards: [] 
      }, 
      citations: [] 
    };
  }
};

export const chatWithAgent = async (agentSubject: string, history: ChatMessage[], userInput: string): Promise<string> => {
  const ai = getAI();
  const chat = ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: { 
      systemInstruction: `You are an AI academic tutor strictly assigned to the subject "${agentSubject}".

      GLOBAL ROLE:
      - Answer ONLY questions related to this subject, its direct subtopics, or essential prerequisites needed to understand it.
      - If a question is outside this scope (different subject, coding, general life advice, etc.), politely refuse and ask the learner to switch subjects or create another tutor.

      UI BEHAVIOR:
      - Do NOT repeat or paraphrase the learner's question.
      - Do NOT add greetings or filler (no "Hi", "Hello", "Sure, I'd be happy to help", etc.).
      - Keep answers concise, structured, and easy to scan.
      - Break explanations into short paragraphs and bullet points.

      EXPLANATION STRATEGY:
      - Assume the learner is new to the topic.
      - Start with simple language first, then gradually add depth.
      - Use real-world analogies only when they fit this subject.

      RESPONSE FORMAT (ALWAYS USE THIS ORDER AND THESE HEADINGS):
      DEFINITION:
      - Simple 1–3 sentence definition of the main concept.

      IMPORTANCE:
      - Explain why this concept matters within ${agentSubject}.

      HOW IT WORKS (STEP-BY-STEP):
      - Step 1: ...
      - Step 2: ...
      - Step 3: ... (only as many steps as needed).

      KEY POINTS OR FEATURES:
      - Bullet list of the most important facts, rules, or properties.

      EXAMPLE:
      - Short, concrete example that stays strictly inside this subject area.

      KEY TAKEAWAYS:
      - 3–5 short bullet points summarizing what the learner should remember.

      STYLE RULES:
      - Prefer clarity over verbosity.
      - Avoid unexplained jargon; briefly define any technical term you introduce.
      - Never answer questions outside the subject; instead, say you are restricted to ${agentSubject} and suggest changing subjects.` 
    }
  });
  const response = await chat.sendMessage({ message: userInput });
  return response.text ?? "Connecting to tutor nodes...";
};

export const extractTasksFromText = async (rawText: string): Promise<any[]> => {
  const ai = getAI();
  const nowIso = new Date().toISOString();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `You are extracting TODO tasks from email text.

The input may contain MULTIPLE emails separated by blocks. Extract tasks from ANY of the emails.

Return ONLY valid JSON matching the provided schema.

Rules:
1) Only include items that have a real deadline/date.
2) deadline MUST be ISO-8601 (e.g. 2026-01-15T23:59:00Z). If only a date is known, set time to 23:59:00Z.
3) title should be short and actionable.
4) source must be "Email".
5) Prefer deadlines in the future relative to NOW (${nowIso}). If a message mentions a month/day without a year and the inferred date would be in the past, assume the next occurrence (e.g. next year).
6) Ignore already-expired deadlines unless the email explicitly says the task is still pending.
7) NEVER use the email received/sent date as a deadline. Only extract deadlines that are explicitly described as due/deadline/submission/exam date etc.
8) Ignore and return an empty array for emails about OTP, verification codes, security alerts, login confirmations, password resets, or account access.
9) Only extract academic/admin deadlines (assignments, quizzes, exams, registrations, fee payments, project submissions, class schedule changes).

EMAIL TEXT:
${rawText}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            deadline: { type: Type.STRING },
            priority: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
            source: { type: Type.STRING }
          },
          required: ['title', 'deadline', 'priority', 'source']
        }
      }
    }
  });

  try {
    return JSON.parse(response.text || '[]');
  } catch {
    return [];
  }
};
