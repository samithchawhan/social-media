// Small, dependency-free helpers for turning API data into HTML strings.

const Render = (() => {
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function initials(name) {
    return String(name || '?')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(w => w[0])
      .join('')
      .toUpperCase();
  }

  function avatarHTML(user, size = 'md') {
    const cls = size === 'lg' ? 'avatar avatar-lg' : (size === 'mini' ? 'mini-avatar' : 'avatar');
    const color = escapeHtml(user.avatar_color || user.avatarColor || '#3C6E58');
    const label = size === 'mini' ? '' : escapeHtml(initials(user.display_name || user.displayName));
    return `<div class="${cls}" style="background:${color}">${label}</div>`;
  }

  function timeAgo(isoString) {
    // SQLite datetime('now') gives UTC without a timezone suffix — treat it as UTC.
    const then = new Date(isoString.includes('Z') ? isoString : isoString.replace(' ', 'T') + 'Z');
    const seconds = Math.max(0, Math.floor((Date.now() - then.getTime()) / 1000));
    const units = [
      ['year', 31536000], ['month', 2592000], ['week', 604800],
      ['day', 86400], ['hour', 3600], ['minute', 60],
    ];
    for (const [name, secs] of units) {
      const n = Math.floor(seconds / secs);
      if (n >= 1) return `${n}${name[0]}`;
    }
    return 'just now';
  }

  const heartIcon = (filled) => `
    <svg viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
      <path d="M12 21s-7.5-4.6-10-9.3C.5 8 2 4 6 4c2.2 0 3.8 1.3 6 4 2.2-2.7 3.8-4 6-4 4 0 5.5 4 4 7.7C19.5 16.4 12 21 12 21z"/>
    </svg>`;
  const commentIcon = () => `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5H3l3-3.3A8.38 8.38 0 0 1 12.5 3a8.5 8.5 0 0 1 8.5 8.5z"/>
    </svg>`;

  function postImageHTML(post) {
    if (!post.image_url) return '';
    const src = escapeHtml(post.image_url);
    const alt = `Photo shared by ${escapeHtml(post.display_name)}`;
    return `<img class="post-image" src="${escapeHtml(src)}" alt="${alt}" loading="lazy" decoding="async">`;
  }

  function postCardHTML(post) {
    return `
      <article class="post-card" data-post-id="${post.id}">
        <div class="post-head">
          ${avatarHTML(post)}
          <div>
            <div class="post-author"><button data-goto-user="${escapeHtml(post.username)}">${escapeHtml(post.display_name)}</button></div>
            <div class="post-meta">@${escapeHtml(post.username)} · ${timeAgo(post.created_at)}</div>
          </div>
        </div>
        ${post.content ? `<p class="post-content">${escapeHtml(post.content)}</p>` : ''}
        ${postImageHTML(post)}
        <div class="post-actions">
          <button class="icon-btn ${post.liked_by_me ? 'is-liked' : ''}" data-action="like" data-post-id="${post.id}">
            ${heartIcon(!!post.liked_by_me)} <span>${post.like_count}</span>
          </button>
          <button class="icon-btn" data-action="open" data-post-id="${post.id}">
            ${commentIcon()} <span>${post.comment_count}</span>
          </button>
        </div>
      </article>`;
  }

  function userRowHTML(user) {
    return `
      <div class="user-row">
        ${avatarHTML(user)}
        <div class="user-row-text">
          <div class="user-row-name"><button data-goto-user="${escapeHtml(user.username)}">${escapeHtml(user.display_name)}</button></div>
          ${user.bio ? `<div class="user-row-bio">${escapeHtml(user.bio)}</div>` : ''}
        </div>
      </div>`;
  }

  function commentHTML(c) {
    return `
      <div class="comment" data-comment-id="${c.id}">
        ${avatarHTML(c)}
        <div class="comment-body">
          <div class="comment-author">${escapeHtml(c.display_name)} <span class="post-meta">· ${timeAgo(c.created_at)}</span></div>
          <p class="comment-text">${escapeHtml(c.content)}</p>
        </div>
      </div>`;
  }

  return { escapeHtml, initials, avatarHTML, timeAgo, postCardHTML, postImageHTML, userRowHTML, commentHTML, heartIcon, commentIcon };
})();
