import { readFileSync } from "node:fs";

import content from "../learning-content.cjs";

const slug = text => text.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/-$/, "");
const escape = text => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const topics = {};
for (const [, title, body, tip] of content.lessons) topics[`learn/${slug(title)}`] = [title, body, tip];
for (const [title, category, body] of content.terms) topics[`glossary/${slug(title)}`] = [title, body, `Category: ${category}. Explore related terms in the glossary and practise decisions at the table.`];
for (const [key, title, body] of [["hard", "Hard totals", "A hard hand has no ace counted as 11. Hard 12 stands against dealer 4–6, but hits against 2 or 3. Hard 13 stands against 2–6. On an original two-card hard 16 against 10, surrender if available; otherwise hit."], ["soft", "Soft totals", "A soft hand contains an ace worth 11. Soft 18 doubles against 3–6 when affordable, otherwise stands. Against 9, 10 or ace it hits. The ace can become 1 as cards are drawn."], ["pair", "Pairs", "Consider pair strategy before hard totals. Split aces and eights when affordable; keep tens together. Play fives as hard 10. This trainer permits up to four hands for non-ace pairs. Split aces receive one card each, with no hitting, doubling or re-splitting; a split ace plus a ten counts as 21 and pays 1:1 on a win."]]) topics[`charts/${key}`] = [title, body, "Dealer stands on soft 17. Doubling after splitting non-ace pairs and late surrender on the original hand are available. These are fixed trainer recommendations; deck count and casino rules can change optimal strategy. Basic strategy does not guarantee profit."];
const origin = "https://blackjack-trainer.co";
const practiceTitle = "Free Blackjack Trainer | Practice Basic Strategy";
const practiceDescription = "Practise blackjack basic strategy free with instant decision feedback, learning lessons, a glossary and strategy charts. No login required.";
const pages = {
  learn: ["Learn Blackjack Rules & Basic Strategy | Blackjack Trainer", "Learn blackjack rules, card values, hitting, standing, doubling, splitting and surrender. Test your decisions with a free basic strategy quiz.", "Learn blackjack", "Learn the rules and practise choosing when to hit, stand, double, split or surrender. Basic strategy improves decisions over many hands; it does not guarantee a profit."],
  glossary: ["Blackjack Glossary | Card & Strategy Terms Explained", "Understand blackjack terms including soft and hard hands, bust, push, insurance, splitting and late surrender with our free blackjack glossary.", "Blackjack glossary", "Explore the language of blackjack, from soft hands and pairs to insurance and late surrender."],
  charts: ["Blackjack Basic Strategy Charts | Free Interactive Guide", "Explore interactive blackjack basic strategy charts for hard hands, soft hands and pairs, with dealer stands on soft 17 and late surrender.", "Blackjack basic strategy charts", "Explore opening-hand recommendations for hard hands, soft hands and pairs. These charts use the trainer’s fixed rules; optimal strategy depends on the table rules."],
};

export function renderSeoPage(template, page) {
  const section = page.split("/")[0];
  const topic = topics[page];
  const [title, description, heading, intro] = topic
    ? [`${topic[0]} | Blackjack Trainer`, topic[1], topic[0], topic[1]] : pages[page];
  const entries = Object.entries(topics).filter(([path]) => path.startsWith(`${section}/`));
  const indexHeading = { learn: "All blackjack lessons", glossary: "All glossary terms", charts: "All strategy charts" }[section];
  const links = `<nav aria-label="${escape(indexHeading)}"><ul>${entries.map(([path, entry]) => `<li><a class="topic-link" href="/${path}">${escape(entry[0])}</a></li>`).join("")}</ul></nav>`;
  const indexBody = section === "glossary" ? `<details><summary>Browse all ${entries.length} glossary terms</summary>${links}</details>` : links;
  const topicIndex = `<section class="topic-index" aria-labelledby="${section}IndexHeading"><h2 id="${section}IndexHeading">${escape(indexHeading)}</h2>${indexBody}</section>`;
  const initial = topic ? `<article class="learning-card"><h2>${escape(topic[0])}</h2><p>${escape(topic[1])}</p><p>${escape(topic[2])}</p><p><a class="topic-link" href="/${section}">${escape(indexHeading)} →</a></p></article>` : entries.map(([, entry]) => `<article><h2>${escape(entry[0])}</h2><p>${escape(entry[1])}</p><p>${escape(entry[2])}</p></article>`).join("");
  return template
    .replace("<head>", '<head><base href="/">')
    .replaceAll(practiceTitle, escape(title))
    .replaceAll(practiceDescription, escape(description))
    .replaceAll(`${origin}/"`, `${origin}/${page}"`)
    .replace('<main id="gamePage">', '<main id="gamePage" hidden>')
    .replace('<main id="placeholderPages" hidden>', '<main id="placeholderPages">')
    .replace(`data-placeholder-content="${section}" hidden`, `data-placeholder-content="${section}"`)
    .replace(`>${section[0].toUpperCase() + section.slice(1)}</h1>`, `>${escape(heading)}</h1><p>${escape(intro)}</p>`)
    .replace(`<div id="${section}Content"></div>`, topic
      ? `<div class="topic-view">${initial}</div><div id="${section}Content"></div><div data-related-topics></div>`
      : `<div id="${section}Content">${initial}</div>${topicIndex}`)
    .replace(' data-placeholder-page="practice" aria-current="page"', ' data-placeholder-page="practice"')
    .replace(`data-placeholder-page="${section}"`, `data-placeholder-page="${section}" aria-current="page"`);
}

export function registerSeoRoutes(app, frontendRoot) {
  const template = readFileSync(`${frontendRoot}/index.html`, "utf8");
  for (const page of [...Object.keys(pages), ...Object.keys(topics)]) {
    app.get(`/${page}`, (req, res) => res.type("html").send(renderSeoPage(template, page)));
  }
  app.get("/robots.txt", (req, res) => res.sendFile(`${frontendRoot}/robots.txt`));
  app.get("/sitemap.xml", (req, res) => res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["", ...Object.keys(pages), ...Object.keys(topics)].map(path => `<url><loc>${origin}/${path}</loc></url>`).join("")}</urlset>`));
}
