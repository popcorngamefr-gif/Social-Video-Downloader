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

  // Détection plateforme
  let platform;
  if (url.includes('tiktok.com') || url.includes('vm.tiktok')) platform = 'tiktok';
  else if (url.includes('instagram.com')) platform = 'instagram';
  else if (url.includes('youtube.com') || url.includes('youtu.be')) platform = 'youtube';
  else if (url.includes('facebook.com') || url.includes('fb.watch')) platform = 'facebook';
  else if (url.includes('twitter.com') || url.includes('x.com')) platform = 'twitter';
  else return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Plateforme non supportée. TikTok, Instagram, YouTube, Facebook ou X/Twitter uniquement.' }) };

  try {
    let result;

    if (platform === 'tiktok') {
      const res = await fetch(`https://tiktok-video-no-watermark2.p.rapidapi.com/?url=${encodeURIComponent(url)}&hd=1`, {
        headers: { 'X-RapidAPI-Key': API_KEY, 'X-RapidAPI-Host': 'tiktok-video-no-watermark2.p.rapidapi.com' }
      });
      const d = await res.json();
      if (!d || d.code !== 0) throw new Error(d?.msg || 'Erreur TikTok');
      const v = d.data;
      result = {
        title: v.title || 'Vidéo TikTok',
        author: v.author?.unique_id ? '@' + v.author.unique_id : '',
        thumb: v.cover || null,
        links: [
          v.hdplay && { label: '📹 Vidéo HD (sans filigrane)', url: v.hdplay, quality: 'HD · MP4' },
          v.play   && { label: '📹 Vidéo SD', url: v.play, quality: 'SD · MP4' },
          v.music  && { label: '🎵 Musique', url: v.music, quality: 'MP3' },
        ].filter(Boolean),
      };
    }

    else if (platform === 'instagram') {
      const res = await fetch(`https://instagram-downloader-download-instagram-videos-stories.p.rapidapi.com/index?url=${encodeURIComponent(url)}`, {
        headers: { 'X-RapidAPI-Key': API_KEY, 'X-RapidAPI-Host': 'instagram-downloader-download-instagram-videos-stories.p.rapidapi.com' }
      });
      const d = await res.json();
      const videoUrl = d.url || (Array.isArray(d.media) ? d.media[0] : d.media);
      if (!videoUrl) throw new Error('Impossible de récupérer la vidéo Instagram');
      result = {
        title: 'Reel Instagram',
        author: d.username ? '@' + d.username : '',
        thumb: d.thumbnail || null,
        links: [{ label: '📹 Vidéo sans filigrane', url: videoUrl, quality: 'MP4' }],
      };
    }

    else if (platform === 'youtube') {
      const res = await fetch(`https://youtube-video-and-shorts-downloader.p.rapidapi.com/download?url=${encodeURIComponent(url)}`, {
        headers: { 'X-RapidAPI-Key': API_KEY, 'X-RapidAPI-Host': 'youtube-video-and-shorts-downloader.p.rapidapi.com' }
      });
      const d = await res.json();
      if (!d || !d.formats) throw new Error('Impossible de récupérer la vidéo YouTube');
      const fmts = d.formats.filter(f => f.url && f.ext === 'mp4').slice(0, 3);
      result = {
        title: d.title || 'Vidéo YouTube',
        author: d.channel || '',
        thumb: d.thumbnail || null,
        links: fmts.map(f => ({
          label: `📹 ${f.format_note || f.quality || 'Vidéo'}`,
          url: f.url,
          quality: (f.format_note || '') + ' · MP4',
        })),
      };
    }

    else if (platform === 'facebook') {
      const res = await fetch(`https://facebook-reel-and-video-downloader.p.rapidapi.com/?url=${encodeURIComponent(url)}`, {
        headers: { 'X-RapidAPI-Key': API_KEY, 'X-RapidAPI-Host': 'facebook-reel-and-video-downloader.p.rapidapi.com' }
      });
      const d = await res.json();
      const linksData = d?.links || d?.data || {};
      const hd = linksData?.['Download High Quality'] || linksData?.hd;
      const sd = linksData?.['Download Low Quality'] || linksData?.sd;
      if (!hd && !sd) throw new Error('Impossible de récupérer la vidéo Facebook');
      result = {
        title: d?.title || 'Vidéo Facebook',
        author: '',
        thumb: d?.thumbnail || null,
        links: [
          hd && { label: '📹 Vidéo HD', url: hd, quality: 'HD · MP4' },
          sd && { label: '📹 Vidéo SD', url: sd, quality: 'SD · MP4' },
        ].filter(Boolean),
      };
    }

    else {
      const res = await fetch(`https://twitter-api45.p.rapidapi.com/twvideo?id=${encodeURIComponent(url)}`, {
        headers: { 'X-RapidAPI-Key': API_KEY, 'X-RapidAPI-Host': 'twitter-api45.p.rapidapi.com' }
      });
      const d = await res.json();
      const medias = Array.isArray(d?.media) ? d.media : [];
      const videos = medias.filter(m => m.url);
      if (!videos.length) throw new Error('Impossible de récupérer la vidéo X/Twitter');
      result = {
        title: d?.text?.slice(0, 80) || 'Vidéo X/Twitter',
        author: d?.user?.screen_name ? '@' + d.user.screen_name : '',
        thumb: videos[0]?.preview_image_url || null,
        links: videos.slice(0, 3).map((v, i) => ({
          label: `📹 Vidéo ${i + 1}`,
          url: v.url,
          quality: v?.quality || 'MP4',
        })),
      };
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
