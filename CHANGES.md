## 2026-06-08 — Answer correction feature
- Added GROQ_API_KEY as Cloudflare Worker secret
- Added POST /correct route to worker (Groq Llama 3.3 70B, json_object response format)
- Moved /health route before auth block so it's always publicly reachable (worker v2.1.0)
- Extended renderQuestions() in Renderer to add answer textareas and Check answers button
- Added checkAnswers() to Correction section
- Added currentContext and currentQuestions to State
- Added correction CSS to index.html
- Fixed index.html to load app.js via <script src="app.js"> instead of inline script
