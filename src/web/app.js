const $ = id => document.getElementById(id);
let timer = null;
async function call(path, options = {}) {
  const token = $('token').value;
  const response = await fetch(path, {
    ...options,
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'HTTP ' + response.status);
  return data;
}
function log(message) {
  $('log').textContent = new Date().toLocaleTimeString('pl-PL') + ' / ' + message + '\n' + $('log').textContent.slice(0, 1500);
}
async function poll(id) {
  try {
    const job = await call('/api/jobs/' + id);
    $('state').textContent = job.status.toUpperCase();
    $('detail').textContent = job.progress ? job.progress.phase + ' / ' + (job.progress.url || '') : 'W kolejce';
    $('connection').textContent = 'STAN: ' + job.status.toUpperCase();
    if (job.result) {
      $('pagesCount').textContent = job.result.pages;
      $('assetsCount').textContent = job.result.assets;
      $('apiCount').textContent = job.result.apiEndpoints;
      $('findingsCount').textContent = job.result.findings;
    }
    if (job.status === 'completed' || job.status === 'failed') {
      clearInterval(timer);
      timer = null;
      $('start').disabled = false;
      log(job.status === 'failed' ? job.error : 'Zadanie zakończone. Wyniki zapisane lokalnie w output/api-jobs/' + id);
    }
  } catch (error) {
    clearInterval(timer);
    timer = null;
    $('start').disabled = false;
    log(error.message);
  }
}
$('start').addEventListener('click', async () => {
  if (timer) clearInterval(timer);
  if (!$('authorized').checked) return log('Wymagane potwierdzenie upoważnienia.');
  try {
    $('start').disabled = true;
    const { job } = await call('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        url: $('url').value, maxPages: Number($('pages').value),
        authorized: $('authorized').checked
      })
    });
    $('state').textContent = 'QUEUED';
    log('Uruchomiono zadanie ' + job.id);
    await poll(job.id);
    timer = setInterval(() => { void poll(job.id); }, 2000);
  } catch (error) {
    $('start').disabled = false;
    log(error.message);
  }
});
