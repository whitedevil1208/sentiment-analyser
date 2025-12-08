document.getElementById('analyzeBtn').addEventListener('click', async () => {
    const resultsDiv = document.getElementById('results');
    const loadingDiv = document.getElementById('loading');

    resultsDiv.innerHTML = '';
    loadingDiv.style.display = 'block';

    try {
        // Get active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // Execute script to get comments
        const injectionResults = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: getComments,
        });

        const comments = injectionResults[0].result;

        if (!comments || comments.length === 0) {
            resultsDiv.innerHTML = '<p>No comments found. Scroll down to load comments.</p>';
            loadingDiv.style.display = 'none';
            return;
        }

        // Analyze comments (Process ALL comments)
        const stats = { positive: 0, neutral: 0, negative: 0 };
        const total = comments.length;

        // Update UI to show progress
        loadingDiv.innerText = `Analyzing ${total} comments...`;

        // 1. Sentiment Analysis (Parallel requests with concurrency limit would be better, but sequential for simplicity/stability)
        // We'll use Promise.all for a bit of speedup, processing in chunks of 5
        const chunkSize = 5;
        for (let i = 0; i < total; i += chunkSize) {
            const chunk = comments.slice(i, i + chunkSize);
            const promises = chunk.map(text =>
                fetch('http://localhost:8000/predict', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: text })
                }).then(res => res.json())
                    .then(data => {
                        if (data.sentiment) stats[data.sentiment]++;
                    })
                    .catch(e => console.error("API Error:", e))
            );
            await Promise.all(promises);
            loadingDiv.innerText = `Analyzed ${Math.min(i + chunkSize, total)}/${total} comments...`;
        }

        // 2. Summarization
        loadingDiv.innerText = "Generating summary...";
        let summaryText = "Could not generate summary.";
        try {
            const summaryResponse = await fetch('http://localhost:8000/summarize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ comments: comments })
            });
            const summaryData = await summaryResponse.json();
            if (summaryData.summary) {
                summaryText = summaryData.summary;
            }
        } catch (e) {
            console.error("Summary API Error:", e);
        }

        // Display results
        resultsDiv.innerHTML = `
      <div class="stat"><span>Positive:</span> <b>${stats.positive}</b></div>
      <div class="stat"><span>Neutral:</span> <b>${stats.neutral}</b></div>
      <div class="stat"><span>Negative:</span> <b>${stats.negative}</b></div>
      <p><small>Analyzed ${total} comments</small></p>
    `;

        // Display Summary
        const summaryDiv = document.getElementById('summary');
        const summarySpan = document.getElementById('summaryText');
        summarySpan.innerText = summaryText;
        summaryDiv.style.display = 'block';

    } catch (error) {
        resultsDiv.innerHTML = `<p style="color:red">Error: ${error.message}</p>`;
    } finally {
        loadingDiv.style.display = 'none';
        loadingDiv.innerText = "Analyzing..."; // Reset text
    }
});

// This function runs in the context of the web page
function getComments() {
    const commentElements = document.querySelectorAll('ytd-comment-thread-renderer #content-text');
    const comments = [];
    commentElements.forEach(el => {
        if (el.innerText) comments.push(el.innerText);
    });
    return comments;
}
