## HalalChain Agent (UMHackathon) — MVP Prototype

Front-end heavy prototype for helping SMEs prepare JAKIM (Halal) certification submissions.

- **Stack**: Next.js (App Router) + React + Tailwind
- **Persistence**: `localStorage` only (no database)
- **AI**: Vercel AI SDK (Gemini) with safe fallbacks when quota is exceeded

## Getting Started

### 1) Install dependencies

From the project root:

```bash
npm install
```

### 2) Set environment variables

Create or edit `.env.local` in the project root and set:

```env
GOOGLE_GENERATIVE_AI_API_KEY=your_real_gemini_key_here
```

Notes:
- If your Gemini project has **quota = 0**, the chatbox will still respond using offline guidance mode.
- Whenever you change `.env.local`, you must restart the dev server.

### 3) Run the dev server

```bash
npm run dev
```

### 4) Open the app

Open:
- `http://localhost:3000`

### 5) Login (mock auth)

On the login screen you can:
- Select **SME Food Producer** to enter the SME dashboard
- Select **Ingredient Supplier** to enter the Supplier portal

If you get stuck, use the “Quick access” buttons (Enter as SME / Enter as Supplier).

## Key Features (Prototype)

- **Document upload** (PDF / TXT / XLSX / CSV) with auto-classification
- **Compliance gap checker** for required documents
- **Ingredient verification** (Halal / Haram / Ambiguous)
- **Supplier verification loop** via shared `localStorage` (`halalchain_requests`)
- **AI Chatbox** (bottom-right) as a JAKIM assistant
- **Export for JAKIM**:
  - downloads `HalalChain_Export.json`
  - downloads `_modified.txt` versions of documents
  - opens MYeHALAL sign-in page

## Useful localStorage keys

- `halalchain_user`: mock auth session + role
- `halalchain-mvp-state`: SME uploaded docs + ingredient state
- `halalchain_requests`: supplier verification requests
- `halalchain_lang`: language selection

## Troubleshooting

### Port 3000 already in use

If Next.js says port 3000 is already in use, stop the other process and re-run:

```bash
npm run dev
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
