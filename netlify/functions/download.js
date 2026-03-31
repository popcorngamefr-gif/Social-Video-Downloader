const COBALT_API = 'https://api.cobalt.tools';

function detectPlatform(url) {
  if (url.includes('tiktok.com') || url.includes('vm.tiktok')) return 'tiktok';
  if (url.includes('instagram.com')) return 'instagram';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  return null;
}

function getPlatformTitle(platform) {
  return { tiktok: 'Vidéo TikTok', instagram: 'Post Instagram', youtube: 'Vidéo YouTube' }[platform] || 'Vidéo';
}

exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { url } = body;
  if (!url) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Missing URL' }) };
  }

  const platform = detectPlatform(url);
  if (!platform) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Lien non reconnu. TikTok, Instagram et YouTube uniquement.' }),
    };
  }

  try {
    const cobaltRes = await fetch(COBALT_API, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; VidDrop/1.0)',
      },
      body: JSON.stringify({
        url,
        videoQuality: '1080',
        audioFormat: 'mp3',
        filenameStyle: 'pretty',
        downloadMode: 'auto',
        tiktokFullAudio: true,
        removeTikTokWatermark: true,
      }),
    });

    const data = await cobaltRes.json();

    if (!cobaltRes.ok || data.status === 'error') {
      throw new Error(data?.error?.code || 'Erreur API cobalt');
    }

    let result = {};

    if (data.status === 'stream' || data.status === 'redirect' || data.status === 'tunnel') {
      result = {
        platform,
        title: data.filename || getPlatformTitle(platform),
        thumb: null,
        links: [{ label: '📥 Vidéo sans filigrane', url: data.url, quality: 'HD · MP4' }],
      };
    } else if (data.status === 'picker') {
      result = {
        platform,
        title: getPlatformTitle(platform),
        thumb: data.picker[0]?.thumb || null,
        links: data.picker.map((item, i) => ({
          label: item.type === 'video' ? `📹 Vidéo ${i + 1}` : `🖼 Image ${i + 1}`,
          url: item.url,
          quality: item.type === 'video' ? 'MP4' : 'JPG',
        })),
      };
    } else {
      throw new Error('Réponse inattendue');
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message || 'Erreur inconnue' }),
    };
  }
};
