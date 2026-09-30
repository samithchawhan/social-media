(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = { user: null, currentScope: 'all', currentProfileUsername: null };

  // ---------------- Toast ----------------
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
  }

  function showModal(el) { el.hidden = false; }
  function hideModal(el) { el.hidden = true; }

  // ---------------- Auth screen ----------------
  function wireAuthScreen() {
    $$('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.tab-btn').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        const tab = btn.dataset.tab;
        $('#form-login').hidden = tab !== 'login';
        $('#form-register').hidden = tab !== 'register';
      });
    });

    $('#form-login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = $('[data-error-for="login"]');
      errEl.hidden = true;
      const fd = new FormData(e.target);
      try {
        const { token, user } = await Api.login({ email: fd.get('email'), password: fd.get('password') });
        Api.setToken(token);
        enterApp(user);
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
      }
    });

    $('#form-register').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = $('[data-error-for="register"]');
      errEl.hidden = true;
      const fd = new FormData(e.target);
      try {
        const { token, user } = await Api.register({
          username: fd.get('username'),
          displayName: fd.get('displayName'),
          email: fd.get('email'),
          password: fd.get('password'),
        });
        Api.setToken(token);
        enterApp(user);
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
      }
    });
  }

  function showAuthScreen() {
    $('#view-app').hidden = true;
    $('#view-auth').hidden = false;
  }

  // ---------------- Entering the app ----------------
  function enterApp(user) {
    state.user = user;
    $('#view-auth').hidden = true;
    $('#view-app').hidden = false;
    $('#me-name').textContent = user.display_name;
    $('#me-avatar').outerHTML = Render.avatarHTML(user, 'mini').replace('class="mini-avatar"', 'class="mini-avatar" id="me-avatar"');
    if (!location.hash) location.hash = '#/feed';
    route();
  }

  function logout() {
    Api.clearToken();
    location.hash = '';
    location.reload();
  }

  // ---------------- Routing ----------------
  function route() {
    const hash = location.hash.replace(/^#\/?/, '');
    if (hash.startsWith('u/')) {
      showProfilePane(decodeURIComponent(hash.slice(2)));
    } else if (hash === 'following') {
      showFeedPane('following');
    } else {
      showFeedPane('all');
    }
  }

  // ---------------- Feed ----------------
  async function showFeedPane(scope) {
    state.currentScope = scope;
    $('#pane-feed').hidden = false;
    $('#pane-profile').hidden = true;
    $('#feed-heading').textContent = scope === 'following' ? 'Following' : 'Feed';
    $$('.nav-link[data-route]').forEach(b => b.classList.toggle('is-active', b.dataset.route === scope || (scope === 'all' && b.dataset.route === 'feed')));
    $$('[data-nav-profile]').forEach(b => b.classList.remove('is-active'));

    const list = $('#feed-list');
    list.innerHTML = '<p class="empty-note">Loading…</p>';
    try {
      const { posts } = await Api.getFeed(scope);
      renderPostList(list, posts, scope === 'following'
        ? 'Nobody you follow has posted yet. Follow a few people from their profile.'
        : 'No posts yet — be the first to say something.');
    } catch (err) {
      list.innerHTML = `<p class="empty-note">${Render.escapeHtml(err.message)}</p>`;
    }
  }

  function renderPostList(container, posts, emptyMessage) {
    if (!posts.length) {
      container.innerHTML = `<p class="empty-note">${Render.escapeHtml(emptyMessage)}</p>`;
      return;
    }
    container.innerHTML = posts.map(Render.postCardHTML).join('');
  }

  function wireComposer() {
    const form = $('#composer');
    const textarea = form.querySelector('textarea');
    const imageInput = $('#post-image');
    const preview = $('#composer-image-preview');
    const previewImage = $('#composer-image-preview-img');
    const imageName = $('#composer-image-name');
    const postButton = form.querySelector('[type="submit"]');
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxImageBytes = 5 * 1024 * 1024;
    let previewUrl = null;

    function updatePostButton() {
      postButton.disabled = !textarea.value.trim() && !imageInput.files.length;
    }

    function clearImage() {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = null;
      imageInput.value = '';
      previewImage.removeAttribute('src');
      imageName.textContent = '';
      preview.hidden = true;
      updatePostButton();
    }

    textarea.addEventListener('input', () => {
      $('#composer-count').textContent = textarea.value.length;
      updatePostButton();
    });

    imageInput.addEventListener('change', () => {
      const image = imageInput.files[0];
      if (!image) return clearImage();
      if (!allowedTypes.includes(image.type)) {
        toast('Choose a JPEG, PNG, or WebP image.');
        return clearImage();
      }
      if (image.size > maxImageBytes) {
        toast('Images must be 5 MB or smaller.');
        return clearImage();
      }

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(image);
      previewImage.src = previewUrl;
      imageName.textContent = image.name;
      preview.hidden = false;
      updatePostButton();
    });

    $('#remove-composer-image').addEventListener('click', clearImage);
    updatePostButton();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const content = textarea.value.trim();
      const image = imageInput.files[0];
      if (!content && !image) return;
      postButton.disabled = true;
      try {
        await Api.createPost(content, image);
        textarea.value = '';
        $('#composer-count').textContent = '0';
        clearImage();
        toast('Posted.');
        if (!location.hash || location.hash === '#/feed' || location.hash === '#/following') route();
      } catch (err) {
        toast(err.message);
      } finally {
        updatePostButton();
      }
    });
  }

  // Shared click handling for any list of post cards (feed or profile)
  function wirePostListDelegation(listEl) {
    listEl.addEventListener('click', async (e) => {
      const gotoBtn = e.target.closest('[data-goto-user]');
      if (gotoBtn) { location.hash = `#/u/${encodeURIComponent(gotoBtn.dataset.gotoUser)}`; return; }

      const likeBtn = e.target.closest('[data-action="like"]');
      if (likeBtn) {
        e.stopPropagation();
        try {
          const { liked, like_count } = await Api.toggleLike(likeBtn.dataset.postId);
          likeBtn.classList.toggle('is-liked', liked);
          likeBtn.querySelector('span').textContent = like_count;
        } catch (err) { toast(err.message); }
        return;
      }

      const openBtn = e.target.closest('[data-action="open"]') || e.target.closest('.post-card');
      if (openBtn) openPostModal(openBtn.dataset.postId);
    });
  }

  // ---------------- Post detail modal ----------------
  async function openPostModal(postId) {
    const modal = $('#modal-post');
    const body = $('#modal-post-body');
    body.innerHTML = '<p class="empty-note">Loading…</p>';
    showModal(modal);
    try {
      const [{ post }, { comments }] = await Promise.all([Api.getPost(postId), Api.getComments(postId)]);
      const canDelete = state.user && post.user_id === state.user.id;
      body.innerHTML = `
        <article class="post-card detail-post" data-post-id="${post.id}" style="cursor:default">
          <div class="post-head">
            ${Render.avatarHTML(post)}
            <div>
              <div class="post-author"><button data-goto-user="${Render.escapeHtml(post.username)}">${Render.escapeHtml(post.display_name)}</button></div>
              <div class="post-meta">@${Render.escapeHtml(post.username)} · ${Render.timeAgo(post.created_at)}</div>
            </div>
          </div>
          ${post.content ? `<p class="post-content">${Render.escapeHtml(post.content)}</p>` : ''}
          ${Render.postImageHTML(post)}
          <div class="post-actions">
            <button class="icon-btn ${post.liked_by_me ? 'is-liked' : ''}" data-action="like" data-post-id="${post.id}">
              ${Render.heartIcon(!!post.liked_by_me)} <span>${post.like_count}</span>
            </button>
            ${canDelete ? '<button class="icon-btn" data-action="delete-post">Delete post</button>' : ''}
          </div>
        </article>
        <hr class="divider">
        <div class="comment-list">${comments.map(Render.commentHTML).join('') || '<p class="empty-note">No comments yet.</p>'}</div>
        <form class="comment-form" id="modal-comment-form">
          <input type="text" name="content" maxlength="1000" placeholder="Add a comment…" required>
          <button class="btn btn-primary" type="submit">Reply</button>
        </form>`;

      body.querySelector('[data-goto-user]')?.addEventListener('click', () => {
        location.hash = `#/u/${encodeURIComponent(post.username)}`;
        hideModal(modal);
      });

      body.querySelector('[data-action="like"]').addEventListener('click', async (btn2) => {
        try {
          const { liked, like_count } = await Api.toggleLike(post.id);
          const likeBtn = body.querySelector('[data-action="like"]');
          likeBtn.classList.toggle('is-liked', liked);
          likeBtn.querySelector('span').textContent = like_count;
          syncCountInLists(post.id, 'like', like_count);
        } catch (err) { toast(err.message); }
      });

      const delBtn = body.querySelector('[data-action="delete-post"]');
      if (delBtn) {
        delBtn.addEventListener('click', async () => {
          if (!confirm('Delete this post? This cannot be undone.')) return;
          try {
            await Api.deletePost(post.id);
            hideModal(modal);
            $$(`.post-card[data-post-id="${post.id}"]`).forEach(el => el.remove());
            toast('Post deleted.');
          } catch (err) { toast(err.message); }
        });
      }

      $('#modal-comment-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = e.target.content;
        const text = input.value.trim();
        if (!text) return;
        try {
          const { comment } = await Api.createComment(post.id, text);
          $('.comment-list', body).insertAdjacentHTML('beforeend', Render.commentHTML(comment));
          $('.empty-note', body)?.remove();
          input.value = '';
          const openBtn = document.querySelector(`[data-action="open"][data-post-id="${post.id}"] span`);
          if (openBtn) openBtn.textContent = String(Number(openBtn.textContent) + 1);
        } catch (err) { toast(err.message); }
      });
    } catch (err) {
      body.innerHTML = `<p class="empty-note">${Render.escapeHtml(err.message)}</p>`;
    }
  }

  function syncCountInLists(postId, kind, value) {
    $$(`[data-action="${kind}"][data-post-id="${postId}"] span`).forEach(span => { span.textContent = value; });
  }

  // ---------------- Profile pane ----------------
  async function showProfilePane(username) {
    state.currentProfileUsername = username;
    $('#pane-feed').hidden = true;
    $('#pane-profile').hidden = false;
    $$('.nav-link[data-route]').forEach(b => b.classList.remove('is-active'));
    $$('[data-nav-profile]').forEach(b => b.classList.toggle('is-active', username === state.user.username));
    $('#form-edit-profile').hidden = true;

    const postList = $('#profile-post-list');
    postList.innerHTML = '<p class="empty-note">Loading…</p>';

    try {
      const [{ user, counts, isFollowing, isSelf }, { posts }] = await Promise.all([
        Api.getUser(username), Api.getUserPosts(username),
      ]);

      $('#profile-avatar').outerHTML = Render.avatarHTML(user, 'lg').replace('class="avatar avatar-lg"', 'class="avatar avatar-lg" id="profile-avatar"');
      $('#profile-display-name').textContent = user.display_name;
      $('#profile-username').textContent = `@${user.username}`;
      $('#profile-bio').textContent = user.bio || '';
      $('#count-posts').textContent = counts.posts;
      $('#count-followers').textContent = counts.followers;
      $('#count-following').textContent = counts.following;

      const followBtn = $('#btn-follow');
      const editBtn = $('#btn-edit-profile');
      if (isSelf) {
        followBtn.hidden = true;
        editBtn.hidden = false;
      } else {
        editBtn.hidden = true;
        followBtn.hidden = false;
        followBtn.textContent = isFollowing ? 'Following' : 'Follow';
        followBtn.classList.toggle('btn-ghost', isFollowing);
        followBtn.classList.toggle('btn-primary', !isFollowing);
        followBtn.onclick = async () => {
          try {
            const result = await Api.toggleFollow(username);
            followBtn.textContent = result.following ? 'Following' : 'Follow';
            followBtn.classList.toggle('btn-ghost', result.following);
            followBtn.classList.toggle('btn-primary', !result.following);
            $('#count-followers').textContent = result.counts.followers;
          } catch (err) { toast(err.message); }
        };
      }

      editBtn.onclick = () => {
        const form = $('#form-edit-profile');
        form.hidden = false;
        form.displayName.value = user.display_name;
        form.bio.value = user.bio || '';
        form.avatarColor.value = user.avatar_color || '#3C6E58';
      };

      renderPostList(postList, posts, isSelf ? "You haven't posted anything yet." : `@${username} hasn't posted anything yet.`);

      $$('[data-open-list]').forEach(btn => {
        btn.onclick = () => openUserListModal(btn.dataset.openList, username);
      });
    } catch (err) {
      postList.innerHTML = `<p class="empty-note">${Render.escapeHtml(err.message)}</p>`;
    }
  }

  function wireEditProfileForm() {
    $('#btn-cancel-edit').addEventListener('click', () => { $('#form-edit-profile').hidden = true; });
    $('#form-edit-profile').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const { user } = await Api.updateMe({
          displayName: fd.get('displayName'),
          bio: fd.get('bio'),
          avatarColor: fd.get('avatarColor'),
        });
        state.user = { ...state.user, ...user };
        $('#me-name').textContent = user.display_name;
        $('#me-avatar').outerHTML = Render.avatarHTML(user, 'mini').replace('class="mini-avatar"', 'class="mini-avatar" id="me-avatar"');
        $('#form-edit-profile').hidden = true;
        toast('Profile updated.');
        showProfilePane(user.username);
      } catch (err) { toast(err.message); }
    });
  }

  // ---------------- Followers/following modal ----------------
  async function openUserListModal(kind, username) {
    const modal = $('#modal-list');
    const title = $('#modal-list-title');
    const body = $('#modal-list-body');
    title.textContent = kind === 'followers' ? 'Followers' : 'Following';
    body.innerHTML = '<p class="empty-note">Loading…</p>';
    showModal(modal);
    try {
      const data = kind === 'followers' ? await Api.getFollowers(username) : await Api.getFollowing(username);
      const rows = kind === 'followers' ? data.followers : data.following;
      body.innerHTML = rows.length ? rows.map(Render.userRowHTML).join('') : '<p class="empty-note">Nobody here yet.</p>';
    } catch (err) {
      body.innerHTML = `<p class="empty-note">${Render.escapeHtml(err.message)}</p>`;
    }
  }

  // ---------------- Wiring that only needs to happen once ----------------
  function wireNav() {
    $$('.nav-link[data-route]').forEach(btn => {
      btn.addEventListener('click', () => { location.hash = `#/${btn.dataset.route}`; });
    });
    $$('[data-nav-profile]').forEach(btn => {
      btn.addEventListener('click', () => { location.hash = `#/u/${encodeURIComponent(state.user.username)}`; });
    });
    $('#btn-logout').addEventListener('click', logout);
    $('#btn-logout-mobile').addEventListener('click', logout);
    window.addEventListener('hashchange', route);
  }

  function wireModals() {
    $('#modal-post-close').addEventListener('click', () => hideModal($('#modal-post')));
    $('#modal-post').addEventListener('click', (e) => { if (e.target.id === 'modal-post') hideModal(e.target); });
    $('#modal-list-close').addEventListener('click', () => hideModal($('#modal-list')));
    $('#modal-list').addEventListener('click', (e) => { if (e.target.id === 'modal-list') hideModal(e.target); });
    $('#modal-list-body').addEventListener('click', (e) => {
      const gotoBtn = e.target.closest('[data-goto-user]');
      if (gotoBtn) {
        location.hash = `#/u/${encodeURIComponent(gotoBtn.dataset.gotoUser)}`;
        hideModal($('#modal-list'));
      }
    });
  }

  // ---------------- Boot ----------------
  async function init() {
    wireAuthScreen();
    wireNav();
    wireComposer();
    wireEditProfileForm();
    wireModals();
    wirePostListDelegation($('#feed-list'));
    wirePostListDelegation($('#profile-post-list'));

    const token = Api.getToken();
    if (!token) { showAuthScreen(); return; }
    try {
      const { user } = await Api.me();
      enterApp(user);
    } catch {
      Api.clearToken();
      showAuthScreen();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
