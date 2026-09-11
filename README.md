<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/27cc1064-794d-416c-8dc4-0c5c5093d1e5

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` in [.env.local](.env.local). The default model is `ag/gemini-3.6-flash-medium` at `http://localhost:20128/v1`.
3. Start the combined backend/frontend server:
   `start-all.bat`
4. Open `http://localhost:13826`.
5. Stop the server:
   `stop-all.bat`

The backend API and Vite frontend run in one process on port `13826`.
