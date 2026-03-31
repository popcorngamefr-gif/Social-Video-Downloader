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
  const isInstagram = normalizedUrl.includes('instagram.com') || normalizedUrl.includes('threads.net') || normalizedUrl.includes('threads.com');
  const isYoutube = normalizedUrl.includes('youtube.com') || normalizedUrl.includes('youtu.be');

  if (!isInstagram && !isYoutube) {
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

  const runFallbacks = async (candidates, extractor, genericError) => {
    let lastError = null;

    for (const candidate of candidates) {
      try {
        const payload = await rapidApiGet(candidate);
        const result = extractor(payload, candidate);
        if (result) return result;
        lastError = new Error(`Aucun lien exploitable via ${candidate.host}`);
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(lastError?.message || genericError);
  };

  const uniqueNonEmpty = (arr) => [...new Set(arr.filter(Boolean))];

  const extractMediaIdFromUrl = (rawUrl) => {
    const u = String(rawUrl);
    const directMatch = u.match(/\b(\d{8,})\b/);
    if (directMatch) return directMatch[1];

    const shortcodeMatch = u.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i);
    if (!shortcodeMatch) return null;

    return shortcodeMatch[1];
  };

  try {
    let result;

    if (isInstagram) {
      const encodedUrl = encodeURIComponent(url);
      const mediaId = extractMediaIdFromUrl(url);

      const instagramCandidates = [
        {
          host: 'instagram-best-experience.p.rapidapi.com',
          endpoint: mediaId ? `/media?id=${encodeURIComponent(mediaId)}` : '',
          enabled: Boolean(mediaId),
        },
        {
          host: 'instagram-reels-downloader-api.p.rapidapi.com',
          endpoint: `/download?url=${encodedUrl}`,
          enabled: true,
        },
        {
          host: 'instagram-downloader-download-instagram-stories-videos4.p.rapidapi.com',
          endpoint: `/convert?url=${encodedUrl}`,
          enabled: true,
        },
      ].filter((candidate) => candidate.enabled && candidate.endpoint);

      result = await runFallbacks(
        instagramCandidates,
        (data) => {
          const links = [];

          if (typeof data?.url === 'string') links.push(data.url);
          if (typeof data?.download_url === 'string') links.push(data.download_url);
          if (typeof data?.video === 'string') links.push(data.video);
          if (typeof data?.video_url === 'string') links.push(data.video_url);
          if (typeof data?.result === 'string') links.push(data.result);
          if (data?.result?.url) links.push(data.result.url);

          if (Array.isArray(data?.media)) {
            for (const mediaItem of data.media) {
              if (typeof mediaItem === 'string') links.push(mediaItem);
              if (mediaItem?.url) links.push(mediaItem.url);
              if (mediaItem?.download_url) links.push(mediaItem.download_url);
              if (mediaItem?.video_url) links.push(mediaItem.video_url);
            }
          }

          if (Array.isArray(data?.videos)) {
            for (const videoItem of data.videos) {
              if (typeof videoItem === 'string') links.push(videoItem);
              if (videoItem?.url) links.push(videoItem.url);
              if (videoItem?.download_url) links.push(videoItem.download_url);
            }
          }

          if (Array.isArray(data?.links)) {
            for (const linkItem of data.links) {
              if (typeof linkItem === 'string') links.push(linkItem);
              if (linkItem?.url) links.push(linkItem.url);
            }
          }

          const uniqueLinks = uniqueNonEmpty(links);
          if (!uniqueLinks.length) return null;

          return {
            title: data?.title || 'Post Instagram/Threads',
            author: data?.username ? `@${data.username}` : '',
            thumb: data?.thumbnail || data?.cover || data?.image || null,
            links: uniqueLinks.slice(0, 5).map((mediaUrl, index) => ({
              label: `📹 Téléchargement ${index + 1}`,
              url: mediaUrl,
              quality: 'MP4',
            })),
          };
        },
        'Impossible de récupérer la vidéo Instagram/Threads',
      );
    } else {
      const encodedUrl = encodeURIComponent(url);

      const youtubeCandidates = [
        {
          host: 'youtube-video-and-shorts-downloader1.p.rapidapi.com',
          endpoint: `/youtube/download?url=${encodedUrl}`,
        },
        {
          host: 'youtube-video-and-shorts-downloader1.p.rapidapi.com',
          endpoint: `/youtube/links?url=${encodedUrl}`,
        },
        {
          host: 'youtube-video-and-shorts-downloader.p.rapidapi.com',
          endpoint: `/download?url=${encodedUrl}`,
        },
      ];

      result = await runFallbacks(
        youtubeCandidates,
        (data) => {
          const formats = Array.isArray(data?.formats)
            ? data.formats
            : Array.isArray(data?.links)
              ? data.links
              : [];

          const downloadable = formats
            .filter((item) => item?.url)
            .map((item) => ({
              label: `📹 ${item?.format_note || item?.quality || item?.label || 'Vidéo'}`,
              url: item.url,
              quality: `${item?.format_note || item?.quality || 'MP4'} · ${item?.ext?.toUpperCase() || 'MP4'}`,
            }));

          if (!downloadable.length) return null;

          return {
            title: data?.title || 'Vidéo YouTube',
            author: data?.channel || data?.author || '',
            thumb: data?.thumbnail || data?.thumb || null,
            links: downloadable.slice(0, 5),
          };
        },
        'Impossible de récupérer des liens de téléchargement YouTube',
      );
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
