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
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'JSON invalide' }) };
  }

  const { url } = body;
  if (!url) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'URL manquante' }) };

  const normalizedUrl = String(url).toLowerCase();
  let platform;

  if (normalizedUrl.includes('instagram.com') || normalizedUrl.includes('threads.net') || normalizedUrl.includes('threads.com')) {
    platform = 'instagram';
  } else if (normalizedUrl.includes('youtube.com') || normalizedUrl.includes('youtu.be')) {
    platform = 'youtube';
  } else {
    return {
      statusCode: 400,
      headers: cors,
      body: JSON.stringify({ error: 'Plateforme non supportée. Utilise uniquement un lien YouTube, Instagram ou Threads.' }),
    };
  }

  const rapidApiGet = async ({ host, endpoint }) => {
    const response = await fetch(`https://${host}${endpoint}`, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': API_KEY,
        'X-RapidAPI-Host': host,
      },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.message || payload?.error || `Erreur API (${response.status})`);
    }
    return payload;
  };

  try {
    let result;

    if (platform === 'instagram') {
      const encoded = encodeURIComponent(url);
      const isThreads = normalizedUrl.includes('threads.net') || normalizedUrl.includes('threads.com');

      const data = isThreads
        ? await rapidApiGet({
            host: 'instagram-downloader-download-instagram-videos-stories5.p.rapidapi.com',
            endpoint: `/getThreads?url=${encoded}`,
          })
        : await rapidApiGet({
            host: 'instagram-downloader-download-instagram-videos-stories5.p.rapidapi.com',
            endpoint: `/index?url=${encoded}`,
          });

      const links = [];

      if (typeof data?.url === 'string') links.push(data.url);
      if (Array.isArray(data?.media)) {
        for (const mediaItem of data.media) {
          if (typeof mediaItem === 'string') links.push(mediaItem);
          if (mediaItem?.url) links.push(mediaItem.url);
          if (mediaItem?.download_url) links.push(mediaItem.download_url);
        }
      }
      if (Array.isArray(data?.video_urls)) links.push(...data.video_urls.filter(Boolean));
      if (Array.isArray(data?.videos)) {
        for (const videoItem of data.videos) {
          if (videoItem?.url) links.push(videoItem.url);
          if (videoItem?.download_url) links.push(videoItem.download_url);
        }
      }

      const uniqueLinks = [...new Set(links.filter(Boolean))];
      if (!uniqueLinks.length) throw new Error('Impossible de récupérer la vidéo Instagram/Threads');

      result = {
        title: data?.title || (isThreads ? 'Post Threads' : 'Post Instagram'),
        author: data?.username ? `@${data.username}` : '',
        thumb: data?.thumbnail || data?.cover || null,
        links: uniqueLinks.slice(0, 4).map((mediaUrl, index) => ({
          label: `📹 Téléchargement ${index + 1}`,
          url: mediaUrl,
          quality: 'MP4',
        })),
      };
    } else {
      const encoded = encodeURIComponent(url);

      const candidates = [
        {
          host: 'youtube-video-and-shorts-downloader1.p.rapidapi.com',
          endpoint: `/youtube/download?url=${encoded}`,
        },
        {
          host: 'youtube-video-and-shorts-downloader1.p.rapidapi.com',
          endpoint: `/youtube/links?url=${encoded}`,
        },
        {
          host: 'youtube-video-and-shorts-downloader.p.rapidapi.com',
          endpoint: `/download?url=${encoded}`,
        },
      ];

      let data;
      let lastError;
      for (const candidate of candidates) {
        try {
          data = await rapidApiGet(candidate);
          if (data) break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!data) {
        throw new Error(lastError?.message || 'Impossible de joindre la source YouTube');
      }

      const formats = Array.isArray(data?.formats) ? data.formats : Array.isArray(data?.links) ? data.links : [];

      const downloadable = formats
        .filter((item) => item?.url)
        .map((item) => ({
          label: `📹 ${item?.format_note || item?.quality || item?.label || 'Vidéo'}`,
          url: item.url,
          quality: `${item?.format_note || item?.quality || 'MP4'} · ${item?.ext?.toUpperCase() || 'MP4'}`,
        }));

      if (!downloadable.length) {
        throw new Error('Impossible de récupérer des liens de téléchargement YouTube');
      }

      result = {
        title: data?.title || 'Vidéo YouTube',
        author: data?.channel || data?.author || '',
        thumb: data?.thumbnail || data?.thumb || null,
        links: downloadable.slice(0, 5),
      };
    }

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message || 'Erreur inconnue' }),
    };
  }
};
