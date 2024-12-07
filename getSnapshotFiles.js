import * as cheerio from "cheerio";
import { JsonRpc } from "eosjs";
import fetch from "node-fetch";

const rpc = new JsonRpc("https://wax.qaraqol.com", { fetch }); // Replace with your preferred WAX API endpoint

async function getProviders() {
  try {
    const tableData = await rpc.get_table_rows({
      json: true,
      code: "producerjson",
      scope: "producerjson",
      table: "producerjson",
      lower_bound: "",
      upper_bound: "",
      limit: 100,
      reverse: false,
    });
    return tableData.rows.map((row) => JSON.parse(row.json)); // Extract JSON metadata
  } catch (error) {
    console.error("Error fetching table rows:", error);
    throw error;
  }
}

const filterProviders = async () => {
  const providers = await getProviders();
  return providers.filter(
    (provider) =>
      provider.org.hasOwnProperty("chain_resources") &&
      provider.org.chain_resources != ""
  );
};
const getSnapshotProviderLinks = async () => {
  const filteredProviders = await filterProviders();
  let snapshotProviders = [];
  filteredProviders.forEach((provider) =>
    snapshotProviders.push({
      name: provider.producer_account_name,
      url: provider.org.chain_resources,
    })
  );
  return snapshotProviders;
};
const getSnapshotProviders = async () => {
  const providers = await getSnapshotProviderLinks();
  return providers;
};

class SnapshotFinder {
  constructor() {
    this.WAX_PRIMARY_PATTERNS = [
      /wax.*\.(bin|tar\.gz|zst|gz)$/i,
      /wax.*main.*\.(bin|tar\.gz|zst|gz|bz2)$/i,
      /snapshot.*wax.*main.*\.(bin|tar\.gz|zst|gz|bz2)$/i,
      /wax.*snapshot.*\.(bin|tar\.gz|zst|gz|bz2)$/i,
    ];

    this.WAX_FALLBACK_PATTERNS = [
      /^(?!.*\b(fio|jungle)\b).*snapshot.*\.(bin|tar\.gz|zst|gz)$/i,
      /^(?!.*\b(fio|jungle)\b).*?\.(bin|tar\.gz|zst|gz)$/i,
    ];

    this.AVOID_DOMAINS = new Set(["github.com", "gitlab.com", "bitbucket.org"]);
    this.AVOID_PATHS =
      /hyperion|light_api|jungle|telos|fio|libre|NEAR|qry|test|ultra|kylin|volt|proton|daobet|(?:test|testnet)/i;
    this.MAX_DEPTH = 5;
    this.visitedUrls = new Set();
    this.timeout = 15000;
  }

  isValidWaxSnapshot(link, primaryOnly = false) {
    if (this.WAX_PRIMARY_PATTERNS.some((pattern) => pattern.test(link))) {
      return true;
    }
    if (primaryOnly) {
      return false;
    }
    return this.WAX_FALLBACK_PATTERNS.some((pattern) => pattern.test(link));
  }

  getSnapshotProbabilityScore(link) {
    let score = 0;
    const lowerHref = link.href.toLowerCase();
    const lowerText = link.text.toLowerCase();

    if (lowerHref.includes("wax")) score += 5;
    if (lowerText.includes("wax")) score += 4;
    if (lowerHref.includes("mainnet")) score += 3;
    if (lowerHref.includes("snapshot")) score += 2;
    if (/(\.bin|\.gz|\.zst)$/i.test(lowerHref)) score += 2;
    if (lowerHref.includes("latest")) score += 1;
    if (/\d{6,}/.test(lowerHref)) score += 1;

    return score;
  }

  async findWaxSnapshot(urlString, depth = 0) {
    if (depth > this.MAX_DEPTH) return null;

    try {
      const parsedUrl = new URL(urlString);
      if (this.AVOID_DOMAINS.has(parsedUrl.hostname)) return null;

      if (depth === 0 && parsedUrl.hostname === "snapshots.eossweden.org") {
        const waxResult = await this.findWaxSnapshot(
          "https://snapshots.waxsweden.org/",
          depth + 1
        );
        if (waxResult) return waxResult;
      }

      const $ = await this.loadPage(urlString);
      if (!$) return null;

      const links = this.extractLinks($, urlString);
      const sortedLinks = links.sort(
        (a, b) =>
          this.getSnapshotProbabilityScore(b) -
          this.getSnapshotProbabilityScore(a)
      );

      for (const link of sortedLinks) {
        if (this.isValidWaxSnapshot(link.href, true)) {
          console.log(`Found snapshot: ${link.href}`);
          return link.href;
        }
      }

      const potentialDirs = links
        .filter((link) => {
          const lowerHref = link.href.toLowerCase();
          const lowerText = link.text.toLowerCase();
          const isWaxDir =
            lowerHref.includes("wax") || lowerText.includes("wax");
          return (
            (isWaxDir ||
              lowerHref.includes("mainnet") ||
              lowerHref.includes("snapshot")) &&
            (link.href.endsWith("/") || !link.href.includes(".")) &&
            !this.AVOID_PATHS.test(lowerHref)
          );
        })
        .sort((a, b) => {
          const aIsWax =
            a.href.toLowerCase().includes("wax") ||
            a.text.toLowerCase().includes("wax");
          const bIsWax =
            b.href.toLowerCase().includes("wax") ||
            b.text.toLowerCase().includes("wax");
          return bIsWax - aIsWax;
        });

      for (const dir of potentialDirs) {
        const snapshot = await this.findWaxSnapshot(dir.href, depth + 1);
        if (snapshot) return snapshot;
      }

      for (const link of sortedLinks) {
        if (this.isValidWaxSnapshot(link.href, false)) {
          console.log(`Found snapshot: ${link.href}`);
          return link.href;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  async loadPage(urlString) {
    if (this.visitedUrls.has(urlString)) return null;
    this.visitedUrls.add(urlString);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      if (urlString.includes("blokcrafters.io")) {
        const jsonUrl = new URL("data/snapshots.json", urlString).href;
        try {
          const jsonResponse = await fetch(jsonUrl, {
            signal: controller.signal,
            headers: {
              Accept: "application/json",
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            },
          });
          clearTimeout(timeoutId);

          if (jsonResponse.ok) {
            const snapshots = await jsonResponse.json();
            const $ = cheerio.load("<html><body></body></html>");
            snapshots.forEach((snapshot) => {
              const tempEl = cheerio.load(snapshot.name);
              const filename = tempEl("a").attr("href");
              if (filename) {
                const snapshotUrl = new URL(filename, urlString).href;
                $("body").append(`<a href="${snapshotUrl}">wax-snapshot</a>`);
              }
            });
            return $;
          }
        } catch (error) {
          return null;
        }
      }

      const response = await fetch(urlString, {
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      });
      clearTimeout(timeoutId);

      if (!response.ok) return null;
      const contentType = response.headers.get("content-type");

      if (
        !contentType ||
        (!contentType.includes("text/html") &&
          !contentType.includes("application/xhtml+xml"))
      ) {
        return null;
      }

      const html = await response.text();
      return cheerio.load(html);
    } catch (error) {
      return null;
    }
  }

  extractLinks($, baseUrl) {
    const links = new Set();
    $('a, link[rel="alternate"]').each((_, el) => {
      const $el = $(el);
      let href = $el.attr("href");
      const text = $el.text().trim();

      if (!href || href === "#" || href.startsWith("javascript:")) return;

      try {
        const resolvedUrl = new URL(href, baseUrl).href;
        const baseHost = new URL(baseUrl).hostname;
        const resolvedHost = new URL(resolvedUrl).hostname;

        if (
          (baseHost === "snapshots.waxsweden.org" ||
            baseHost === "snapshots.eossweden.org") &&
          (resolvedHost === "snapshots-cdn.eossweden.org" ||
            resolvedHost === "snapshots.waxsweden.org")
        ) {
          links.add({ text, href: resolvedUrl });
          return;
        }

        const baseMainDomain = baseHost.split(".").slice(-2).join(".");
        const resolvedMainDomain = resolvedHost.split(".").slice(-2).join(".");

        if (
          baseMainDomain === resolvedMainDomain ||
          resolvedUrl.startsWith(baseUrl)
        ) {
          links.add({ text, href: resolvedUrl });
        }
      } catch (e) {
        // Skip invalid URLs
      }
    });

    return Array.from(links);
  }

  async findLatestSnapshots(providers) {
    const results = [];
    for (const provider of providers) {
      const cleanUrl = provider.url.replace(/^\(+|\)+$/g, "").trim();
      console.log(`Checking provider: ${provider.name} (${cleanUrl})`);
      try {
        const snapshot = await this.findWaxSnapshot(cleanUrl);
        results.push({ name: provider.name, snapshotUrl: snapshot });
      } catch (error) {
        results.push({ name: provider.name, snapshotUrl: null });
      }
    }
    return results;
  }
}

async function getSnapshotFiles() {
  const providers = await getSnapshotProviders();
  const finder = new SnapshotFinder();
  const snapshots = await finder.findLatestSnapshots(providers);

  return snapshots;
}
export default getSnapshotFiles;
