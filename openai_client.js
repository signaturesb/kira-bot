'use strict';

/**
 * Isolated OpenAI Responses API client for Kira.
 * Uses Node 18+ built-in fetch so no new npm dependency is required.
 * Nothing in this module changes Claude or Kira's existing tool routing.
 */
async function askOpenAI(input, options = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY non configurée dans Render');

  const text = String(input || '').trim();
  if (!text) throw new Error('Écris ta question après /gpt');

  const model = options.model || process.env.OPENAI_MODEL || 'gpt-5.4';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: text,
        instructions: 'Tu es le moteur OpenAI de Kira, assistante de Shawn Barrette. Réponds en français québécois clair, direct, professionnel et utile. Pour ce test, réponds seulement à la question: aucune action externe et aucun envoi de courriel ou document.',
      }),
    });

    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = null; }

    if (!res.ok) {
      const detail = data?.error?.message || raw || `HTTP ${res.status}`;
      throw new Error(`OpenAI HTTP ${res.status}: ${String(detail).substring(0, 400)}`);
    }

    const outputText = data?.output_text || (data?.output || [])
      .flatMap(item => item?.content || [])
      .filter(part => part?.type === 'output_text')
      .map(part => part?.text || '')
      .join('\n')
      .trim();

    if (!outputText) throw new Error('OpenAI a répondu sans texte exploitable');
    return { text: outputText, model, id: data?.id || null };
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('OpenAI timeout après 90 secondes');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { askOpenAI };
