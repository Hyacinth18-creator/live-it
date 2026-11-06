const form = document.getElementById('loginForm');
const message = document.getElementById('authMessage');
const submit = document.getElementById('signIn');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  submit.disabled = true;
  message.textContent = '';
  form.classList.add('is-submitting');

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(new FormData(form)),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to sign in.');

    const next = new URLSearchParams(location.search).get('next');
    const requestedPage = `${location.pathname}${location.search}`;
    const destination = next || (['/', '/login', '/login.html'].includes(location.pathname) ? requestedPage : '/');
    location.assign(destination.startsWith('/') && !destination.startsWith('//') ? destination : '/');
  } catch (error) {
    message.textContent = error.message;
    submit.disabled = false;
    form.classList.remove('is-submitting');
  }
});