// Uses Google's Gemini API (via Google AI Studio) - the free tier that
// doesn't require a credit card, which is why this was picked over
// OpenAI/Anthropic for this feature. Get a key at https://aistudio.google.com/apikey
// and set GEMINI_API_KEY in .env.
const GEMINI_MODEL = 'gemini-3.8-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export async function askGemini({ systemPrompt, message, history = [] }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set - the chat assistant is not configured yet.');
  }

  const contents = [
    ...history.map((turn) => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.text }]
    })),
    { role: 'user', parts: [{ text: message }] }
  ];

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { maxOutputTokens: 400, temperature: 0.7 }
    })
  });

  
  if (!res.ok) {
    const errText = await res.text().catch(() => '');

    if (res.status === 503 || res.status === 429) {
      throw new Error(
        'The AI assistant is temporarily busy. Please try again in a moment.'
      );
    }

    console.error(`Gemini API error (${res.status}): ${errText.slice(0, 200)}`);
    throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 200)}`);
  }


  const data = await res.json();
  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) throw new Error('Gemini returned no usable response.');
  return reply.trim();
}
