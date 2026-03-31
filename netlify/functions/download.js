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

  if (normalizedUrl.includes('tiktok.com') || normalizedUrl.includes('vm.tiktok')) {
    platform = 'tiktok';
  } else if (normalizedUrl.includes('instagram.com') || normalizedUrl.includes('threads.net') || normalizedUrl.includes('threads.com')) {
    platform = 'instagram';
  } else if (normalizedUrl.includes('youtube.com') || normalizedUrl.includes('youtu.be')) {
    platform = 'youtube';
  } else {
    return {
      statusCode: 400,
      headers: cors,
      body: JSON.stringify({ error: 'Plateforme non supportée. Utilise uniquement un lien TikTok, YouTube, Instagram ou Threads.' }),
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

  const extractYoutubeId = (inputUrl) => {
    const shortMatch = inputUrl.match(/youtu\.be\/([^?&/]+)/i);
    if (shortMatch?.[1]) return shortMatch[1];
    const longMatch = inputUrl.match(/[?&]v=([^?&/]+)/i);
    if (longMatch?.[1]) return longMatch[1];
    const embedMatch = inputUrl.match(/\/embed\/([^?&/]+)/i);
    if (embedMatch?.[1]) return embedMatch[1];
    return null;
  };

  const extractLinksFromPayload = (data, platformName) => {
    const links = [];

    if (platformName === 'tiktok') {
      if (typeof data?.hdplay === 'string') links.push({ url: data.hdplay, quality: 'HD' });
      if (typeof data?.play === 'string') links.push({ url: data.play, quality: 'SD' });
      if (typeof data?.music === 'string') links.push({ url: data.music, quality: 'AUDIO' });
      if (typeof data?.wmplay === 'string') links.push({ url: data.wmplay, quality: 'WM' });
      return links;
    }

    if (platformName === 'instagram') {
      if (typeof data?.url === 'string') links.push({ url: data.url });
      if (typeof data?.download_url === 'string') links.push({ url: data.download_url });
      if (typeof data?.video_url === 'string') links.push({ url: data.video_url });
      if (typeof data?.result?.url === 'string') links.push({ url: data.result.url });

      if (Array.isArray(data?.media)) {
        for (const mediaItem of data.media) {
          if (typeof mediaItem === 'string') links.push({ url: mediaItem });
          if (typeof mediaItem?.url === 'string') links.push({ url: mediaItem.url });
          if (typeof mediaItem?.download_url === 'string') links.push({ url: mediaItem.download_url });
          if (typeof mediaItem?.video_url === 'string') links.push({ url: mediaItem.video_url });
        }
      }

      if (Array.isArray(data?.videos)) {
        for (const videoItem of data.videos) {
          if (typeof videoItem === 'string') links.push({ url: videoItem });
          if (typeof videoItem?.url === 'string') links.push({ url: videoItem.url });
          if (typeof videoItem?.download_url === 'string') links.push({ url: videoItem.download_url });
          if (typeof videoItem?.video_url === 'string') links.push({ url: videoItem.video_url });
        }
      }

      return links;
    }

    if (platformName === 'youtube') {
      if (Array.isArray(data?.formats)) {
        for (const format of data.formats) {
          if (typeof format?.url === 'string') {
            links.push({
              url: format.url,
              quality: format?.quality || format?.format_note || format?.label || 'MP4',
            });
          }
        }
      }

      if (Array.isArray(data?.links)) {
        for (const link of data.links) {
          if (typeof link?.url === 'string') {
            links.push({
              url: link.url,
              quality: link?.quality || link?.format_note || link?.label || 'MP4',
            });
          }
        }
      }

      if (typeof data?.url === 'string') links.push({ url: data.url, quality: 'MP4' });
      if (typeof data?.download_url === 'string') links.push({ url: data.download_url, quality: 'MP4' });
      if (typeof data?.result?.url === 'string') links.push({ url: data.result.url, quality: 'MP4' });
      return links;
    }

    return links;
  };

  try {
    let result;

    if (platform === 'tiktok') {
      const encoded = encodeURIComponent(url);
      const data = await rapidApiGet({
        host: 'tiktok-video-no-watermark2.p.rapidapi.com',
        endpoint: `/?url=${encoded}&hd=1`,
      });

      const rawLinks = extractLinksFromPayload(data, 'tiktok');
      const uniqueLinks = [];
      const seen = new Set();
      for (const item of rawLinks) {
        if (item?.url && !seen.has(item.url)) {
          seen.add(item.url);
          uniqueLinks.push(item);
        }
      }
      if (!uniqueLinks.length) throw new Error('Impossible de récupérer la vidéo TikTok');

      result = {
        title: data?.title || 'Vidéo TikTok',
        author: data?.author?.unique_id || data?.author?.nickname || data?.author || '',
        thumb: data?.cover || data?.origin_cover || data?.ai_dynamic_cover || null,
        links: uniqueLinks.slice(0, 4).map((item, index) => ({
          label: `📹 Téléchargement ${index + 1}`,
          url: item.url,
          quality: item.quality || 'MP4',
        })),
      };
    } else if (platform === 'instagram') {
      const encoded = encodeURIComponent(url);
      const candidates = [
        { host: 'instagram-reels-downloader-api.p.rapidapi.com', endpoint: `/download?url=${encoded}` },
        { host: 'instagram-downloader-download-instagram-stories-videos4.p.rapidapi.com', endpoint: `/convert?url=${encoded}` },
        { host: 'instagram-downloader-download-instagram-videos-stories5.p.rapidapi.com', endpoint: `/index?url=${encoded}` },
      ];

      let data;
      let lastError;
      for (const candidate of candidates) {
        try {
          data = await rapidApiGet(candidate);
          const parsed = extractLinksFromPayload(data, 'instagram');
          if (parsed.length) break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!data) {
        throw new Error(lastError?.message || 'Impossible de joindre la source Instagram/Threads');
      }

      const rawLinks = extractLinksFromPayload(data, 'instagram');
      const uniqueLinks = [];
      const seen = new Set();
      for (const item of rawLinks) {
        if (item?.url && !seen.has(item.url)) {
          seen.add(item.url);
          uniqueLinks.push(item);
        }
      }
      if (!uniqueLinks.length) throw new Error('Impossible de récupérer la vidéo Instagram/Threads');

      result = {
        title: data?.title || 'Post Instagram/Threads',
        author: data?.username ? `@${data.username}` : '',
        thumb: data?.thumbnail || data?.cover || null,
        links: uniqueLinks.slice(0, 4).map((item, index) => ({
          label: `📹 Téléchargement ${index + 1}`,
          url: item.url,
          quality: item.quality || 'MP4',
        })),
      };
    } else {
      const encoded = encodeURIComponent(url);
      const videoId = extractYoutubeId(url);
      if (!videoId) throw new Error('Impossible d’extraire l’identifiant YouTube');

      const candidates = [
        {
          host: 'youtube-video-fast-downloader-24-7.p.rapidapi.com',
          endpoint: `/download_video/${videoId}?quality=247`,
        },
        {
          host: 'ytstream-download-youtube-videos.p.rapidapi.com',
          endpoint: `/dl?id=${videoId}`,
        },
        {
          host: 'youtube-video-and-shorts-downloader1.p.rapidapi.com',
          endpoint: `/youtube/download?url=${encoded}`,
        },
        {
          host: 'youtube-video-and-shorts-downloader1.p.rapidapi.com',
          endpoint: `/youtube/links?url=${encoded}`,
        },
      ];

      let data;
      let lastError;
      for (const candidate of candidates) {
        try {
          data = await rapidApiGet(candidate);
          const parsed = extractLinksFromPayload(data, 'youtube');
          if (parsed.length) break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!data) {
        throw new Error(lastError?.message || 'Impossible de joindre la source YouTube');
      }

      const rawLinks = extractLinksFromPayload(data, 'youtube');
      const downloadable = [];
      const seen = new Set();
      for (const item of rawLinks) {
        if (item?.url && !seen.has(item.url)) {
          seen.add(item.url);
          downloadable.push(item);
        }
      }

      if (!downloadable.length) {
        throw new Error('Impossible de récupérer des liens de téléchargement YouTube');
      }

      result = {
        title: data?.title || 'Vidéo YouTube',
        author: data?.channel || data?.author || '',
        thumb: data?.thumbnail || data?.thumb || null,
        links: downloadable.slice(0, 5).map((item, index) => ({
          label: `📹 Téléchargement ${index + 1}`,
          url: item.url,
          quality: item.quality || 'MP4',
        })),
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
