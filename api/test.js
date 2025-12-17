export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  // Check if key exists (don't expose the actual key!)
  const keyInfo = {
    exists: !!apiKey,
    length: apiKey ? apiKey.length : 0,
    startsCorrectly: apiKey ? apiKey.startsWith('sk-ant-') : false,
    firstChars: apiKey ? apiKey.substring(0, 10) + '...' : 'NO KEY FOUND'
  };
  
  return res.status(200).json(keyInfo);
}
