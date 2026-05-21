import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json());

  // Safe Gemini Client Initialization
  const apiKey = process.env.GEMINI_API_KEY;
  let ai: GoogleGenAI | null = null;
  
  if (apiKey && apiKey !== "MY_GEMINI_API_KEY") {
    try {
      ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
      console.log("Gemini API client initialized successfully.");
    } catch (err) {
      console.error("Failed to initialize Gemini API Client:", err);
    }
  } else {
    console.warn("GEMINI_API_KEY is missing or carries placeholder value. AI features will fallback gracefully.");
  }

  // API Check Status
  app.get("/api/status", (req, res) => {
    res.json({
      status: "online",
      aiEnabled: !!ai,
      message: ai
        ? "Perfect! Gemini AI assistant is connected."
        : "Gemini AI features are currently running in mock/offline mode. Provide a real GEMINI_API_KEY in the Secrets panel to activate instant dynamic explanations.",
    });
  });

  // API 1: Gemini Answer Explainer
  app.post("/api/gemini/explain", async (req, res) => {
    try {
      const { question, options, selectedAnswer, correctAnswer, scenario, section, part } = req.body;

      if (!question) {
        return res.status(400).json({ error: "Missing required parameter 'question'" });
      }

      const isCorrect = selectedAnswer === correctAnswer;
      const userSelectedText = options[selectedAnswer] || "None - Skipped";
      const correctText = options[correctAnswer];

      if (!ai) {
        // Fallback explanation if Gemini is offline
        return res.json({
          explanation: `### Standard Review\n\n* **Your Selection:** ${userSelectedText}\n* **Correct Answer:** ${correctText}\n* **Status:** ${
            isCorrect ? "✅ Correct" : "❌ Incorrect"
          }\n\n*General conceptual overview for ${section} (Part ${part}): Please review structural IMA formulas. To get a fully personalized AI deep dive, enable the Gemini API Key.*`,
          aiTips: [
            "Calculate variances using standard formulas: Price Var = AQ * (AP - SP); Efficiency Var = SP * (AH - SH).",
            "Be mindfully attentive to FIFO vs Weight-Average inventory flow patterns.",
            "Ethics questions map closely to the four core IMA ethics rules."
          ],
          formulasUsed: [
            "Variance Analysis formulas",
            "Weighted Cost of Capital (WACC)",
            "DuPont Return on Equity model"
          ]
        });
      }

      const prompt = `You are an elite CMA USA exam tutor helping a candidate master the syllabus. 
We have a practice question from Part ${part}, Section "${section}".
Scenario: ${scenario || "None provided"}
Question: "${question}"
Options:
0) ${options[0]}
1) ${options[1]}
2) ${options[2]}
3) ${options[3]}

The candidate chose option index [${selectedAnswer}] ("${userSelectedText}").
The correct option is index [${correctAnswer}] ("${correctText}").
The candidate's response was: ${isCorrect ? "CORRECT" : "INCORRECT"}.

Please construct a comprehensive tutor response in clear, beautifully formatted Markdown. 
Provide:
1. A brief encouraging opening explaining why the correct answer is indeed correct, and highlighting specifically why the chosen answer was safe/unsafe or right/wrong.
2. A step-by-step mathematical or reasoning breakdown of calculations/logic (with equations clearly isolated on new lines when applicable).
3. The common trap candidates fall into with this topic.
4. An actionable study mnemonic or key exam takeaway.

Be concise yet thorough. Highlight formulas inside code blocks or indented blocks. Keep your language clear, objective, and supportive.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are an expert Certified Management Accountant (CMA US) mentor. Explain accounting, finance, risk management, internal controls, and ethical concepts with flawless accuracy.",
        }
      });

      const rawText = response.text || "No response received";

      // Parse some clean structures out of the text or send back the generated text
      return res.json({
        explanation: rawText,
        aiTips: [
          "Focus on standard definitions & exclusions.",
          "Identify calculations step-by-step to avoid simple arithmetic slips.",
          "Examine standard margins carefully."
        ],
        formulasUsed: []
      });

    } catch (error: any) {
      console.error("Gemini Explain error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // API 2: Gemini Live MCQ Generator
  app.post("/api/gemini/generate-mcq", async (req, res) => {
    try {
      const { part, section } = req.body; // e.g., part: 1, section: "Internal Controls"

      if (!part || !section) {
        return res.status(400).json({ error: "Missing part or section for MCQ generation." });
      }

      if (!ai) {
        // Return a high-quality offline hardcoded question if Gemini is offline
        return res.json({
          fallback: true,
          question: {
            id: `gen-fallback-${Date.now()}`,
            part: Number(part) as 1 | 2,
            section: section,
            scenario: "A medium-sized enterprise struggles to balance internal security with workforce speed.",
            question: `Which of the following internal control procedures is most effective in preventing an employee from both ordering inventory assets and making payments for those assets?`,
            options: [
              "Implementing a dual-factor biometric login on the ERP system.",
              "Establishing adequate segregation of separate duties for purchasing and cash disbursements.",
              "Undergoing an annual financial statement audit by an external CPA firm.",
              "Mandating that all inventory purchases require manager-level pre-approval."
            ],
            correctAnswer: 1,
            explanation: "Proper segregation of duties ensures that no single individual has the capability to initiate, authorize, record, and maintain custody of a single transaction lifecycle. Separating purchasing (authorization/creation) from cash disbursements (custody/payment) is the standard method to prevent errors or fraud in asset management.",
            reference: "IMA Section E: Internal Controls / Segregation of Duties"
          }
        });
      }

      const prompt = `Create one (1) highly realistic, brand new US CMA practice exam MCQ for Part ${part}, Section "${section}".
The question MUST be challenging, simulating the actual level of difficulty on the hard IMA exams. Include wordy scenarios or financial information if appropriate.

You must return a single JSON object that strictly matches the following requested schema. Ensure the correctAnswer is a 0-based index corresponding to the right option. Ensure the distractors (incorrect options) are highly plausible. Provide a detailed explanation of why the correct answer is right and why other options are incorrect.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              scenario: {
                type: Type.STRING,
                description: "The paragraph describing the company's scenario, financials, or background. Leave empty if unnecessary."
              },
              question: {
                type: Type.STRING,
                description: "The clear multiple-choice question question text itself."
              },
              options: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Exactly four (4) plausible multiple-choice options."
              },
              correctAnswer: {
                type: Type.INTEGER,
                description: "The 0-based index of the correct option (0, 1, 2, or 3)."
              },
              explanation: {
                type: Type.STRING,
                description: "Detailed step-by-step explanation showing math calculations, reasoning, and conceptual support."
              },
              reference: {
                type: Type.STRING,
                description: "Detailed IMA syllabus reference code or topic name."
              }
            },
            required: ["question", "options", "correctAnswer", "explanation", "reference"]
          }
        }
      });

      const rawText = (response.text || "").trim();
      let questionObj;
      try {
        questionObj = JSON.parse(rawText);
        // Inject random ID
        questionObj.id = `gen-${Date.now()}`;
        questionObj.part = Number(part);
        questionObj.section = section;
      } catch (parseErr) {
        console.error("JSON parse failure on Gemini output. raw output:", rawText);
        throw new Error("Failed to parse Gemini validated response schema.");
      }

      return res.json({ fallback: false, question: questionObj });

    } catch (error: any) {
      console.error("Gemini Generate MCQ error:", error);
      res.status(500).json({ error: error.message || "Failed to generate dynamic MCQ" });
    }
  });

  // Vite Integration & SPA asset delivery
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Bind server
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server launched successfully on http://localhost:${PORT}`);
    console.log(`Ready for ingress routing.`);
  });
}

startServer().catch((error) => {
  console.error("Express startup failed:", error);
});
