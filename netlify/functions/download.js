exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };

  const API_KEY = process.env.RAPIDAPI_KEY;
  if (!API_KEY) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Clé API manquante côté serveur' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'JSON invalide' }) }; }

  const { url } = body;
  if (!url) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'URL manquante' }) };

  const u = String(url).toLowerCase();
  let platform;
  if (u.includes('tiktok.com') || u.includes('vm.tiktok')) platform = 'tiktok';
  else if (u.includes('instagram.com') || u.includes('threads.net') || u.includes('threads.com')) platform = 'instagram';
  else if (u.includes('youtube.com') || u.includes('youtu.be')) platform = 'youtube';
  else return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Plateforme non supportée. Utilise un lien TikTok, Instagram/Threads ou YouTube.' }) };

  const callRapidApi = async (host, endpoint) => {
    const res = await fetch(`https://${host}${endpoint}`, {
      method: 'GET',
      headers: { 'X-RapidAPI-Key': API_KEY, 'X-RapidAPI-Host': host },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || data?.error || `Erreur API (${res.status})`);
    return data;
  };

  const tryFallbacks = async (candidates, extractor, fallbackError) => {
    let lastError;
    for (const c of candidates) {
      try {
        const data = await callRapidApi(c.host, c.endpoint);
        const result = extractor(data);
        if (result) return result;
        lastError = new Error(`Aucun lien exploitable via ${c.host}`);
      } catch (e) {
        lastError = e;
      }
    }
    throw new Error(lastError?.message || fallbackError);
  };

  const unique = (arr) => [...new Set(arr.filter(Boolean))];
  const ytId = (raw) => {
    const s = String(raw);
    const m = s.match(/(?:v=|youtu\.be\/|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{6,})/i);
    if (m) return m[1];
    return null;
  };

  try {
    let result;

    if (platform === 'tiktok') {
      const d = await callRapidApi('tiktok-video-no-watermark2.p.rapidapi.com', `/?url=${encodeURIComponent(url)}&hd=1`);
      const v = d?.data || {};
      const links = unique([v.hdplay, v.play, v.music, v.wmplay]);
      if (!links.length) throw new Error('Impossible de récupérer la vidéo TikTok');
      result = {
        title: v.title || 'Vidéo TikTok',
        author: v.author?.unique_id ? '@' + v.author.unique_id : '',
        thumb: v.cover || null,
        links: links.slice(0, 4).map((link, i) => ({
          label: i === 0 ? '📹 Vidéo HD (sans watermark)' : `📹 Téléchargement ${i + 1}`,
          url: link,
          quality: link.includes('.mp3') ? 'MP3' : 'MP4',
        })),
      };
    }

    else if (platform === 'instagram') {
      const encoded = encodeURIComponent(url);
      const instagramCandidates = [
        { host: 'instagram-reels-downloader-api.p.rapidapi.com', endpoint: `/download?url=${encoded}` },
        { host: 'instagram-downloader-download-instagram-stories-videos4.p.rapidapi.com', endpoint: `/convert?url=${encoded}` },
        { host: 'instagram-downloader-download-instagram-videos-stories5.p.rapidapi.com', endpoint: `/index?url=${encoded}` },
      ];

      result = await tryFallbacks(
        instagramCandidates,
        (d) => {
          const links = unique([
            d?.url,
            d?.download_url,
            d?.video_url,
            d?.result?.url,
            ...(Array.isArray(d?.media) ? d.media.map((m) => (typeof m === 'string' ? m : m?.url || m?.download_url)) : []),
            ...(Array.isArray(d?.videos) ? d.videos.map((m) => (typeof m === 'string' ? m : m?.url || m?.download_url)) : []),
          ]);
          if (!links.length) return null;
          return {
            title: d?.title || 'Post Instagram/Threads',
            author: d?.username ? '@' + d.username : '',
            thumb: d?.thumbnail || d?.cover || null,
            links: links.slice(0, 5).map((link, i) => ({ label: `📹 Téléchargement ${i + 1}`, url: link, quality: 'MP4' })),
          };
        },
        'Impossible de récupérer la vidéo Instagram/Threads',
      );
    }

    else {
      const encoded = encodeURIComponent(url);
      const id = ytId(url);
      const youtubeCandidates = [
        ...(id ? [{ host: 'youtube-video-fast-downloader-24-7.p.rapidapi.com', endpoint: `/download_video/${encodeURIComponent(id)}?quality=247` }] : []),
        ...(id ? [{ host: 'ytstream-download-youtube-videos.p.rapidapi.com', endpoint: `/dl?id=${encodeURIComponent(id)}` }] : []),
        { host: 'youtube-video-and-shorts-downloader1.p.rapidapi.com', endpoint: `/youtube/download?url=${encoded}` },
        { host: 'youtube-video-and-shorts-downloader1.p.rapidapi.com', endpoint: `/youtube/links?url=${encoded}` },
      ];

      result = await tryFallbacks(
        youtubeCandidates,
        (d) => {
          const formats = [
            ...(Array.isArray(d?.formats) ? d.formats : []),
            ...(Array.isArray(d?.links) ? d.links : []),
          ];
          const links = unique([
            ...formats.map((f) => f?.url),
            d?.url,
            d?.download_url,
            d?.result?.url,
          ]);
          if (!links.length) return null;
          return {
            title: d?.title || 'Vidéo YouTube',
            author: d?.channel || d?.author || '',
            thumb: d?.thumbnail || d?.thumb || null,
            links: links.slice(0, 5).map((link, i) => ({
              label: formats[i]?.format_note || formats[i]?.quality || `📹 Vidéo ${i + 1}`,
              url: link,
              quality: (formats[i]?.format_note || formats[i]?.quality || 'MP4') + ' · MP4',
            })),
          };
        },
        'Impossible de récupérer la vidéo YouTube',
      );
    }

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };

  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message || 'Erreur inconnue' }) };
  }
};
