// Thin wrapper around fetch() for talking to the backend.
// Keeps the JWT in localStorage and attaches it to every request.

const Api = (() => {
  const TOKEN_KEY = 'wisp_token';

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); }

  async function request(path, { method = 'GET', body } = {}) {
    const isFormData = body instanceof FormData;
    const headers = isFormData ? {} : { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`/api${path}`, {
      method,
      headers,
      body: isFormData ? body : (body ? JSON.stringify(body) : undefined),
    });

    if (res.status === 204) return null;

    let data = null;
    try { data = await res.json(); } catch { /* no body */ }

    if (!res.ok) {
      const message = (data && data.error) || `Request failed (${res.status})`;
      throw new Error(message);
    }
    return data;
  }

  return {
    getToken, setToken, clearToken,

    register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
    login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
    me: () => request('/auth/me'),

    getUser: (username) => request(`/users/${encodeURIComponent(username)}`),
    updateMe: (payload) => request('/users/me', { method: 'PUT', body: payload }),
    getUserPosts: (username) => request(`/users/${encodeURIComponent(username)}/posts`),
    getFollowers: (username) => request(`/users/${encodeURIComponent(username)}/followers`),
    getFollowing: (username) => request(`/users/${encodeURIComponent(username)}/following`),
    toggleFollow: (username) => request(`/users/${encodeURIComponent(username)}/follow`, { method: 'POST' }),

    getFeed: (scope) => request(`/posts${scope === 'following' ? '?scope=following' : ''}`),
    getPost: (id) => request(`/posts/${id}`),
    createPost: (content, image) => {
      if (!image) return request('/posts', { method: 'POST', body: { content } });
      const body = new FormData();
      body.append('content', content);
      body.append('image', image);
      return request('/posts', { method: 'POST', body });
    },
    deletePost: (id) => request(`/posts/${id}`, { method: 'DELETE' }),
    toggleLike: (id) => request(`/posts/${id}/like`, { method: 'POST' }),

    getComments: (postId) => request(`/posts/${postId}/comments`),
    createComment: (postId, content) => request(`/posts/${postId}/comments`, { method: 'POST', body: { content } }),
    deleteComment: (id) => request(`/comments/${id}`, { method: 'DELETE' }),
  };
})();
