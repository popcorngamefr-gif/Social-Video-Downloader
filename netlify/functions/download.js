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


  const extractYoutubeIdFromUrl = (rawUrl) => {
    const u = String(rawUrl);

    const directIdMatch = u.match(/(?:v=|youtu\.be\/|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{6,})/i);
    if (directIdMatch) return directIdMatch[1];

    const plainIdMatch = u.match(/\b([A-Za-z0-9_-]{10,})\b/);
    if (plainIdMatch) return plainIdMatch[1];

    return null;
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
      const youtubeId = extractYoutubeIdFromUrl(url);

      const youtubeCandidates = [
        {
          host: 'youtube-video-fast-downloader-24-7.p.rapidapi.com',
          endpoint: youtubeId ? `/download_video/${encodeURIComponent(youtubeId)}?quality=247` : '',
          enabled: Boolean(youtubeId),
        },
        {
          host: 'ytstream-download-youtube-videos.p.rapidapi.com',
          endpoint: youtubeId ? `/dl?id=${encodeURIComponent(youtubeId)}` : '',
          enabled: Boolean(youtubeId),
        },
        {
          host: 'youtube-video-and-shorts-downloader1.p.rapidapi.com',
          endpoint: `/youtube/download?url=${encodedUrl}`,
          enabled: true,
        },
        {
          host: 'youtube-video-and-shorts-downloader1.p.rapidapi.com',
          endpoint: `/youtube/links?url=${encodedUrl}`,
          enabled: true,
        },
        {
          host: 'youtube-video-and-shorts-downloader.p.rapidapi.com',
          endpoint: `/download?url=${encodedUrl}`,
          enabled: true,
        },
      ].filter((candidate) => candidate.enabled && candidate.endpoint);

      result = await runFallbacks(
        youtubeCandidates,
        (data) => {
          const formatItems = [];
          if (Array.isArray(data?.formats)) formatItems.push(...data.formats);
          if (Array.isArray(data?.links)) formatItems.push(...data.links);
          if (Array.isArray(data?.data)) formatItems.push(...data.data);

          const directUrls = [
            data?.url,
            data?.download_url,
            data?.downloadUrl,
            data?.result?.url,
            data?.result?.download_url,
            data?.result?.downloadUrl,
            data?.video_url,
            data?.videoUrl,
          ].filter(Boolean);

          const downloadable = [
            ...formatItems
              .filter((item) => item?.url)
              .map((item) => ({
                label: `📹 ${item?.format_note || item?.quality || item?.label || 'Vidéo'}`,
                url: item.url,
                quality: `${item?.format_note || item?.quality || 'MP4'} · ${item?.ext?.toUpperCase() || 'MP4'}`,
              })),
            ...directUrls.map((link, idx) => ({
              label: `📹 Vidéo ${idx + 1}`,
              url: link,
              quality: 'MP4',
            })),
          ];

          const deduped = uniqueNonEmpty(downloadable.map((item) => item.url)).map((urlItem) =>
            downloadable.find((item) => item.url === urlItem),
          );

          if (!deduped.length) return null;

          return {
            title: data?.title || 'Vidéo YouTube',
            author: data?.channel || data?.author || '',
            thumb: data?.thumbnail || data?.thumb || null,
            links: deduped.slice(0, 5),
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
