export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { area } = req.body || {};
    if (!area || !Array.isArray(area.polygon) || area.polygon.length < 3) {
      return res.status(400).json({ success: false, error: 'Área inválida o no proporcionada.' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    const model = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';

    if (!apiKey) {
      return res.status(500).json({ success: false, error: 'GROQ_API_KEY no configurada en el servidor.' });
    }

    const systemPrompt = [
      'Eres un motor de inferencia geométrica para detección de techos en estudios fotovoltaicos.',
      'Recibes un polígono de área (lat,lng) que delimita un predio o cuadrante.',
      'Debes generar entre 1 y 6 contornos de techo plausibles dentro de ese polígono,',
      'evitando bordes, retiros perimetrales y áreas comunes.',
      'Responde EXCLUSIVAMENTE con JSON válido de la forma:',
      '{"roofs":[{"id":"roof-1","confidence":0.92,"polygon":[[lat,lng],[lat,lng],[lat,lng]],"area_m2":120.5,"note":"texto breve"}]}',
      'No incluyas texto fuera del JSON.'
    ].join(' ');

    const userPayload = {
      area_polygon: area.polygon,
      bounds: area.bounds || null
    };

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(userPayload) }
        ]
      })
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      return res.status(502).json({ success: false, error: 'Error del proveedor de IA: ' + errText });
    }

    const data = await groqRes.json();
    const content = data?.choices?.[0]?.message?.content || '{"roofs":[]}';

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return res.status(502).json({ success: false, error: 'Respuesta de IA no interpretable.' });
    }

    const roofs = Array.isArray(parsed.roofs) ? parsed.roofs : [];
    return res.status(200).json({ success: true, roofs });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || 'Error inesperado.' });
  }
}
