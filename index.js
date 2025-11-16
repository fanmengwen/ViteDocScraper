const fs = require("fs/promises");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");
const TurndownService = require("turndown");
const turndownPluginGfm = require("turndown-plugin-gfm");

const gfm = turndownPluginGfm.gfm;

const BASE_URL = "https://cn.vite.dev";
const ENTRY_PATH = "/guide/";
const ENTRY_URL = `${BASE_URL}${ENTRY_PATH}`;
const OUTPUT_ROOT = path.join(__dirname, "docs");

const turndownService = new TurndownService({
  codeBlockStyle: "fenced",
  headingStyle: "atx",
});

turndownService.use(gfm);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toAbsoluteUrl(href) {
  try {
    return new URL(href, BASE_URL).toString();
  } catch {
    return null;
  }
}

function slugify(input) {
  if (!input) return "misc";

  return (
    input
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      // allow basic latin, digits and CJK, replace others with hyphen
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "") || "misc"
  );
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function fetchHtml(url) {
  const response = await axios.get(url, {
    headers: {
      "User-Agent": "ViteDocScraper/1.0 (+https://cn.vite.dev)",
      "Accept-Language": "zh-CN,zh;q=0.9",
    },
    timeout: 15000,
  });

  return response.data;
}

function extractSidebarLinks(html) {
  const $ = cheerio.load(html);
  const linkMap = new Map();

  // Target the actual VitePress sidebar structure
  // Structure: nav#VPSidebarNav > .group > section.VPSidebarItem
  const sidebarNav = $("nav#VPSidebarNav, nav.VPSidebar, aside.VPDocAside");

  if (sidebarNav.length === 0) {
    console.warn("Warning: Could not find sidebar navigation element");
    return [];
  }

  // Find all section groups (each represents a documentation category)
  sidebarNav
    .find("section.VPSidebarItem.level-0, .group")
    .each((_, section) => {
      const $section = $(section);

      // Extract group title from the section header
      // Try multiple selectors to find the group title
      let groupTitle =
        $section.find("> .item > h2.text").first().text().trim() ||
        $section.find("> .item > .text").first().text().trim() ||
        $section.find("h2.text").first().text().trim() ||
        $section.find("h2, h3").first().text().trim() ||
        "guide";

      // Find all links within this section
      $section.find("a.VPLink[href], a.link[href]").each((_, linkEl) => {
        const href = $(linkEl).attr("href");
        const linkText =
          $(linkEl).find("p.text").text().trim() || $(linkEl).text().trim();

        // Skip invalid links
        if (
          !href ||
          href.startsWith("#") ||
          href.startsWith("http://") ||
          href.startsWith("https://")
        ) {
          return;
        }

        const absoluteUrl = toAbsoluteUrl(href);
        if (!absoluteUrl) return;

        if (!linkMap.has(absoluteUrl)) {
          linkMap.set(absoluteUrl, {
            url: absoluteUrl,
            title: linkText || href,
            group: groupTitle,
          });
        }
      });
    });

  // Fallback: if no links found, try a more generic approach
  if (linkMap.size === 0) {
    console.warn("Warning: Using fallback link extraction method");
    $("nav a[href], aside a[href]").each((_, el) => {
      const href = $(el).attr("href");
      const text = $(el).text().trim();

      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("http://") ||
        href.startsWith("https://")
      ) {
        return;
      }

      const absoluteUrl = toAbsoluteUrl(href);
      if (!absoluteUrl) return;

      if (!linkMap.has(absoluteUrl)) {
        linkMap.set(absoluteUrl, {
          url: absoluteUrl,
          title: text || href,
          group: "guide",
        });
      }
    });
  }

  console.log(`Found ${linkMap.size} unique documentation links`);
  return Array.from(linkMap.values());
}

function normalizePathFromUrl(url) {
  const u = new URL(url);
  let pathname = u.pathname;

  if (pathname.endsWith("/")) {
    pathname += "index.html";
  }

  const trimmed = pathname.replace(/^\/+/, "");
  const segments = trimmed.split("/");
  const fileName = segments.pop() || "index.html";
  const dirSegments = segments;
  const mdName = fileName.replace(/\.html?$/i, "") + ".md";

  return { dirSegments, mdName };
}

async function saveMarkdown(doc, markdown) {
  const { url, group } = doc;
  const { dirSegments, mdName } = normalizePathFromUrl(url);

  // Use URL path directly without adding group prefix to avoid duplication
  // e.g., /guide/philosophy.html -> docs/guide/philosophy.md
  const fullDir = path.join(OUTPUT_ROOT, ...dirSegments);

  await ensureDir(fullDir);

  const filePath = path.join(fullDir, mdName);
  await fs.writeFile(filePath, markdown, "utf8");
  console.log(`Saved: ${filePath}`);
}

function extractContent(html) {
  const $ = cheerio.load(html);

  let main = $("main.VPDoc").first();
  if (!main.length) {
    main = $("main").first();
  }
  if (!main.length) {
    throw new Error("Cannot find main content container");
  }

  const h1 = main.find("h1").first();
  const title =
    h1.text().trim() || $("title").first().text().trim() || "Untitled";

  // remove the title node from the body so it does not duplicate
  if (h1.length) {
    h1.remove();
  }

  // remove typical non-content elements if present
  main.find("nav, .VPDocFooter, .VPDocAside").remove();

  const contentHtml = main.html() || "";
  const markdownBody = turndownService.turndown(contentHtml);

  const finalMarkdown = `# ${title}\n\n${markdownBody.trim()}\n`;
  return finalMarkdown;
}

async function run() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🚀 ViteDocScraper - Starting...`);
  console.log(`${"=".repeat(60)}\n`);
  console.log(`📄 Fetching entry page: ${ENTRY_URL}`);

  const entryHtml = await fetchHtml(ENTRY_URL);
  const docs = extractSidebarLinks(entryHtml);

  if (docs.length === 0) {
    console.error("❌ No documentation links found! Check CSS selectors.");
    return;
  }

  console.log(`\n✅ Discovered ${docs.length} documentation pages\n`);

  // Group docs by category for better logging
  const groupedDocs = docs.reduce((acc, doc) => {
    if (!acc[doc.group]) acc[doc.group] = [];
    acc[doc.group].push(doc);
    return acc;
  }, {});

  console.log("📚 Documentation structure:");
  Object.entries(groupedDocs).forEach(([group, groupDocs]) => {
    console.log(`  - ${group}: ${groupDocs.length} pages`);
  });
  console.log("");

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    try {
      console.log(`[${i + 1}/${docs.length}] 📥 ${doc.group} > ${doc.title}`);
      console.log(`    URL: ${doc.url}`);

      const html = await fetchHtml(doc.url);
      const markdown = extractContent(html);

      await saveMarkdown(doc, markdown);
      successCount++;

      // polite delay between requests
      await sleep(500);
    } catch (error) {
      failCount++;
      console.error(`    ❌ Error: ${error.message}`);
      if (error.response) {
        console.error(`    HTTP Status: ${error.response.status}`);
      }
    }
    console.log("");
  }

  console.log(`${"=".repeat(60)}`);
  console.log(`✨ Scraping completed!`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   📁 Output: ${OUTPUT_ROOT}`);
  console.log(`${"=".repeat(60)}\n`);
}

if (require.main === module) {
  run().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
