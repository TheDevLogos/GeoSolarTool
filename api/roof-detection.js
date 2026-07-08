export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  try {
    const { area } = req.body || {};
    if (!area || !Array.isArray(area.polygon) || area.polygon.length < 3) return res.status(400).json({ success: false, error: 'Área inválida o no proporcionada.' });
    const apiKey = process.env.GROQ_API_KEY;
    const model = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';
    if (!apiKey) return res.status(500).json({ success: false, error: 'GROQ_API_KEY no configurada en el servidor.' });
    const prompt = 'Responde solo JSON válido con roofs array; detecta contornos de techos dentro del polígono dado.';
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${apiKey}` }, body: JSON.stringify({ model, temperature:0.2, response_format:{ type:'json_object' }, messages:[{ role:'system', content:prompt }, { role:'user', content: JSON.stringify(area) }] }) });
    if (!groqRes.ok) return res.status(502).json({ success:false, error:'Error del proveedor de IA' });
    const data = await groqRes.json();
    const content = data?.choices?.[0]?.message?.content || '{"roofs":[]}';
    const parsed = JSON.parse(content);
    return res.status(200).json({ success:true, roofs:Array.isArray(parsed.roofs)?parsed.roofs:[] });
  } catch (e) { return res.status(500).json({ success:false, error:e.message || 'Error inesperado.' }); }
}
