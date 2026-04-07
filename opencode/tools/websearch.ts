import { tool } from "@opencode-ai/plugin"

// Brave Search API — free tier: 2000 queries/month, no rate limit per request.
// Requires BRAVE_SEARCH_API_KEY env var (get a free key at https://brave.com/search/api/).

interface BraveWebResult {
  title: string
  url: string
  description?: string
}

interface BraveSearchResponse {
  web?: { results?: BraveWebResult[] }
}

export default tool({
  description:
    "Search the web using Brave Search. Use when uncertain about a fact, need current info (versions, docs, recent events), or the user asks to search. Returns titles, URLs, and snippets.",
  args: {
    query: tool.schema.string().describe("Search query"),
    max_results: tool.schema
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5)
      .describe("Maximum number of results to return (default 5)"),
  },
  async execute(args) {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY
    if (!apiKey) throw new Error("BRAVE_SEARCH_API_KEY environment variable is not set")

    const params = new URLSearchParams({
      q: args.query,
      count: String(args.max_results),
      result_filter: "web",
    })
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
    })
    if (!res.ok) throw new Error(`Brave Search API error: ${res.status} ${res.statusText}`)

    const data = (await res.json()) as BraveSearchResponse
    const results = data.web?.results ?? []
    if (results.length === 0) return "No results found."

    return results
      .slice(0, args.max_results)
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description ?? ""}`)
      .join("\n\n")
  },
})
