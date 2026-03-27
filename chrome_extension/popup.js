const analyzeBtn = document.getElementById('analyzeBtn');
const resultsDiv = document.getElementById('results');
const loadingDiv = document.getElementById('loading');
const progressBar = document.getElementById('progressBar');
const progressLabel = document.getElementById('progressLabel');
const metaText = document.getElementById('meta');
const summaryDiv = document.getElementById('summary');
const summarySpan = document.getElementById('summaryText');

const MAX_COMMENTS = 180; // cap to keep UX snappy
const CONCURRENCY = 6; // number of parallel API calls

analyzeBtn.addEventListener('click', async () => {
  resultsDiv.innerHTML = '';
  summaryDiv.style.display = 'none';
  metaText.innerText = '';
  setProgress(0, 'Fetching comments…');
  toggleAnalyzing(true);

  try {
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Execute script to get comments
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: getComments,
    });

    const rawComments = injectionResults[0].result || [];
    const uniqueComments = Array.from(new Set(rawComments.map(c => c.trim()))).filter(Boolean);

    if (!uniqueComments.length) {
      resultsDiv.innerHTML = '<p class="muted">No comments found. Scroll the page to load some first.</p>';
      toggleAnalyzing(false);
      setProgress(0, 'Idle');
      return;
    }

    const comments = uniqueComments.slice(0, MAX_COMMENTS);
    const total = comments.length;
    const truncated = uniqueComments.length > MAX_COMMENTS;

    metaText.innerText = truncated
      ? `Analyzing ${total} of ${uniqueComments.length} comments (first ${MAX_COMMENTS} to keep it fast).`
      : `Analyzing ${total} comments.`;

    const stats = { positive: 0, neutral: 0, negative: 0 };
    let processed = 0;

    await withConcurrency(comments, CONCURRENCY, async (text) => {
      try {
        const res = await fetch('http://localhost:8000/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        const data = await res.json();
        if (data.sentiment && stats[data.sentiment] !== undefined) {
          stats[data.sentiment]++;
        }
      } catch (e) {
        console.error('API Error:', e);
      } finally {
        processed++;
        const pct = Math.round((processed / total) * 100);
        setProgress(pct, `Analyzing ${processed}/${total} comments…`);
      }
    });

    // Summarization
    setProgress(100, 'Generating summary…');
    let summaryText = 'Could not generate summary.';
    try {
      const summaryResponse = await fetch('http://localhost:8000/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comments })
      });
      const summaryData = await summaryResponse.json();
      if (summaryData.summary) summaryText = summaryData.summary;
    } catch (e) {
      console.error('Summary API Error:', e);
    }

    renderStats(stats, total);
    summarySpan.innerText = summaryText;
    summaryDiv.style.display = 'block';
    setProgress(100, 'Done');
  } catch (error) {
    resultsDiv.innerHTML = `<p style="color:#ff7b7b">Error: ${error.message}</p>`;
    setProgress(0, 'Idle');
  } finally {
    toggleAnalyzing(false);
  }
});

/**
 * Run a worker across items with limited concurrency.
 */
async function withConcurrency(items, limit, worker) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      await worker(current);
    }
  });
  await Promise.all(workers);
}

function renderStats(stats, total) {
  resultsDiv.innerHTML = `
    <div class="stat positive">
      <span class="label">Positive</span>
      <span class="value">${stats.positive}</span>
    </div>
    <div class="stat neutral">
      <span class="label">Neutral</span>
      <span class="value">${stats.neutral}</span>
    </div>
    <div class="stat negative">
      <span class="label">Negative</span>
      <span class="value">${stats.negative}</span>
    </div>
  `;
  metaText.innerText = metaText.innerText || `Analyzed ${total} comments.`;
}

function setProgress(percent, label) {
  progressBar.style.width = `${percent}%`;
  progressLabel.innerText = label;
  loadingDiv.style.display = 'block';
  loadingDiv.innerText = label;
}

function toggleAnalyzing(isRunning) {
  analyzeBtn.disabled = isRunning;
  analyzeBtn.innerText = isRunning ? 'Analyzing…' : 'Analyze Comments';
  loadingDiv.style.display = isRunning ? 'block' : 'none';
}

// This function runs in the context of the web page
function getComments() {
  const commentElements = document.querySelectorAll('ytd-comment-thread-renderer #content-text');
  const comments = [];
  commentElements.forEach(el => {
    if (el.innerText) comments.push(el.innerText);
  });
  return comments;
}
