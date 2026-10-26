import { readFileSync } from "node:fs";

import content from "../learning-content.cjs";
import catalog from "../strategy-catalog.cjs";
import { renderStrategyGuide } from "./strategy-guide.js";
import { withScriptNonce } from "./content-security-policy.js";

const escape = text => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const topics = content.topics;
const strategyPages = Object.fromEntries(catalog.entries.map(entry => [
  `strategies/${entry.id}`,
  [`${entry.name} | Blackjack Trainer`, entry.rules, entry.name, entry.rules],
]));
const origin = "https://blackjack-trainer.co";
const practiceTitle = "Free Blackjack Trainer | Practice Basic Strategy";
const practiceDescription = "Practise blackjack basic strategy free with instant decision feedback, learning lessons, a glossary and strategy charts. No login required.";
const pages = {
  counting: ["Card Counting Trainer | Blackjack Trainer", "Learn card counting with eight systems, card-value drills, running counts and true-count practice.", "Card counting", "Practise counting one card at a time."],
  strategies: ["Blackjack Strategy Guide | Blackjack Trainer", "Compare blackjack betting systems and playing strategies, with rules, examples, pros, cons and research sources.", "Strategy guide", "Explore established systems and original experiments."],
  simulation: ["Blackjack Strategy Simulator | Blackjack Trainer", "Customize blackjack decisions and betting systems, then simulate up to 100,000 rounds on the server.", "Blackjack strategy simulator", "Explore flat bets, Martingale and your own hand decisions."],
  learn: ["Learn Blackjack Rules & Basic Strategy | Blackjack Trainer", "Learn blackjack rules, card values, hitting, standing, doubling, splitting and surrender. Test your decisions with a free basic strategy quiz.", "Learn blackjack", "Learn the rules and practise choosing when to hit, stand, double, split or surrender. Basic strategy improves decisions over many hands; it does not guarantee a profit."],
  glossary: ["Blackjack Glossary | Card & Strategy Terms Explained", "Understand blackjack terms including soft and hard hands, bust, push, insurance, splitting and late surrender with our free blackjack glossary.", "Blackjack glossary", "Explore the language of blackjack, from soft hands and pairs to insurance and late surrender."],
  charts: ["Blackjack Basic Strategy Charts | Free Interactive Guide", "Explore interactive blackjack basic strategy charts for hard hands, soft hands and pairs, with dealer stands on soft 17 and late surrender.", "Blackjack basic strategy charts", "Explore opening-hand recommendations for hard hands, soft hands and pairs. These charts use the trainer’s fixed rules; optimal strategy depends on the table rules."],
  privacy: ["Privacy Policy | Blackjack Trainer", "How Blackjack Trainer handles account data, practice statistics, Cloudflare Web Analytics and Google advertising cookies.", "Privacy policy"],
};

export function renderLinkedText(text, state) {
  return content.linkify(text, state).map(part => part.href
    ? `<a class="in-text-link" href="${escape(part.href)}">${escape(part.text)}</a>`
    : escape(part.text)).join("");
}

export function renderBreadcrumbs(page) {
  const strategy = catalog.entries.find(entry => page === `strategies/${entry.id}`);
  const crumbs = page === "privacy"
    ? [{ title: "Home", href: "/" }, { title: "Privacy policy", href: "/privacy" }]
    : ["simulation", "counting"].includes(page)
      ? [{ title: "Home", href: "/" }, { title: page === "counting" ? "Card counting" : "Simulation", href: `/${page}` }]
      : page === "strategies" || strategy
        ? [{ title: "Home", href: "/" }, { title: "Strategies", href: "/strategies" }, ...(strategy ? [{ title: strategy.name, href: `/strategies/${strategy.id}` }] : [])]
        : content.breadcrumbs(page);
  const markup = `<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${crumbs.map((crumb, index) =>
    `<li>${index === crumbs.length - 1 ? `<span aria-current="page">${escape(crumb.title)}</span>` : `<a href="${escape(crumb.href)}">${escape(crumb.title)}</a>`}</li>`).join("")}</ol></nav>`;
  const data = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({ "@type": "ListItem", position: index + 1, name: crumb.title, item: `${origin}${crumb.href}` })),
  };
  return { markup, json: JSON.stringify(data).replaceAll("<", "\\u003c") };
}

function renderArticle(topic, state, sectionPage = false) {
  const tip = content.topicTip(topic);
  return `<article${sectionPage ? "" : ' class="learning-card"'}><h2>${escape(topic.title)}</h2><p>${renderLinkedText(topic.body, state)}</p><p>${renderLinkedText(tip, state)}</p>${sectionPage ? "" : `<p><a class="topic-link" href="/${topic.path.split("/")[0]}">${escape(content.sections[topic.path.split("/")[0]].indexHeading)} →</a></p>`}</article>`;
}

export function renderSeoPage(template, page) {
  const section = page.split("/")[0];
  const topic = topics[page];
  const strategy = catalog.entries.find(entry => page === `strategies/${entry.id}`);
  const [title, description, heading, intro] = topic
    ? [`${topic.title} | Blackjack Trainer`, topic.body, topic.title, topic.body]
    : strategy ? strategyPages[page] : pages[page];
  const shell = template
    .replace("<head>", '<head><base href="/">')
    .replaceAll(practiceTitle, escape(title))
    .replaceAll(practiceDescription, escape(description))
    .replaceAll(`${origin}/"`, `${origin}/${page}"`)
    .replace('<main id="gamePage">', '<main id="gamePage" hidden>')
    .replace('<main id="placeholderPages" hidden>', '<main id="placeholderPages">')
    .replace(new RegExp(`<[^>]*\\bdata-placeholder-content="${section}"[^>]*>`), tag =>
      tag.replace(/\s+hidden(?=\s|>)/, ""))
    .replace(' data-placeholder-page="practice" aria-current="page"', ' data-placeholder-page="practice"')
    .replace(`data-placeholder-page="${section}"`, `data-placeholder-page="${section}" aria-current="page"`);
  const breadcrumbs = renderBreadcrumbs(page);
  const withBreadcrumbData = html => html.replace("</head>", `<script id="breadcrumbData" type="application/ld+json">${breadcrumbs.json}</script></head>`);
  if (page === "privacy") return withBreadcrumbData(shell.replace('<h1 id="privacyHeading"', `${breadcrumbs.markup}<h1 id="privacyHeading"`));
  if (section === "strategies") {
    return withBreadcrumbData(shell
      .replace('<h1 id="strategiesHeading" tabindex="-1">Strategies</h1>', `${breadcrumbs.markup}<h1 id="strategiesHeading" tabindex="-1">${escape(heading)}</h1>`)
      .replace('<div id="strategiesContent"></div>', `<div id="strategiesContent">${renderStrategyGuide(strategy?.id)}</div>`));
  }
  if (section === "counting") return withBreadcrumbData(shell.replace('<h1 id="countingHeading"', `${breadcrumbs.markup}<h1 id="countingHeading"`));
  if (section === "simulation") {
    return withBreadcrumbData(shell.replace('<h1 id="simulationHeading" tabindex="-1">Simulation</h1>', `${breadcrumbs.markup}<h1 id="simulationHeading" tabindex="-1">${escape(heading)}</h1>`));
  }
  const entries = Object.entries(topics).filter(([path]) => path.startsWith(`${section}/`));
  const indexHeading = content.sections[section].indexHeading;
  const links = `<nav aria-label="${escape(indexHeading)}"><ul>${entries.map(([path, entry]) => `<li><a class="topic-link" href="/${path}">${escape(entry.title)}</a></li>`).join("")}</ul></nav>`;
  const indexBody = section === "glossary" ? `<details><summary>Browse all ${entries.length} glossary terms</summary>${links}</details>` : links;
  const topicIndex = `<section class="topic-index" aria-labelledby="${section}IndexHeading"><h2 id="${section}IndexHeading">${escape(indexHeading)}</h2>${indexBody}</section>`;
  const state = content.createLinkState(page);
  const initial = topic ? renderArticle(topic, state) : entries.map(([, entry]) =>
    renderArticle(entry, content.createLinkState("", section === "glossary" ? 2 : 5, state.seen), true)).join("");
  const related = topic ? `<section class="related-topics" data-related-topics aria-labelledby="relatedTopicsHeading"><h2 id="relatedTopicsHeading">Related topics</h2><nav aria-label="Related topics"><ul>${topic.related.map(path => `<li><a class="topic-link" href="/${path}">${escape(topics[path].title)}</a></li>`).join("")}</ul></nav></section>` : "";
  return withBreadcrumbData(shell
    .replace(`<h1 id="${section}Heading" tabindex="-1">${content.sections[section].title}</h1>`, `${breadcrumbs.markup}<h1 id="${section}Heading" tabindex="-1">${escape(heading)}</h1>${topic ? "" : `<p class="learning-intro">${escape(intro)}</p>`}`)
    .replace(`<div id="${section}Content"></div>`, topic
      ? `<div class="topic-view">${initial}</div><div id="${section}Content"></div>${related}`
      : `<div id="${section}Content">${initial}</div>${topicIndex}`)
  );
}

export function registerSeoRoutes(app, frontendRoot) {
  const template = readFileSync(`${frontendRoot}/index.html`, "utf8");
  for (const page of [...Object.keys(pages), ...Object.keys(strategyPages), ...Object.keys(topics)]) {
    app.get(`/${page}`, (req, res) => res.type("html").send(withScriptNonce(renderSeoPage(template, page), res.locals.adSenseNonce)));
  }
  app.get("/robots.txt", (req, res) => res.sendFile(`${frontendRoot}/robots.txt`));
  app.get("/sitemap.xml", (req, res) => res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["", ...Object.keys(pages), ...Object.keys(strategyPages), ...Object.keys(topics)].map(path => `<url><loc>${origin}/${path}</loc></url>`).join("")}</urlset>`));
}
