import { readFileSync } from "node:fs";

const origin = "https://blackjack-trainer.co";
const practiceTitle = "Free Blackjack Trainer | Practice Basic Strategy";
const practiceDescription = "Practise blackjack basic strategy free with instant decision feedback, learning lessons, a glossary and strategy charts. No login required.";
const pages = {
  learn: ["Learn Blackjack Rules & Basic Strategy | Blackjack Trainer", "Learn blackjack rules, card values, hitting, standing, doubling, splitting and surrender. Test your decisions with a free basic strategy quiz.", "Learn blackjack", "Learn the rules and practise choosing when to hit, stand, double, split or surrender. Basic strategy improves decisions over many hands; it does not guarantee a profit."],
  glossary: ["Blackjack Glossary | Card & Strategy Terms Explained", "Understand blackjack terms including soft and hard hands, bust, push, insurance, splitting and late surrender with our free blackjack glossary.", "Blackjack glossary", "Explore the language of blackjack, from soft hands and pairs to insurance and late surrender."],
  charts: ["Blackjack Basic Strategy Charts | Free Interactive Guide", "Explore interactive blackjack basic strategy charts for hard hands, soft hands and pairs, with dealer stands on soft 17 and late surrender.", "Blackjack basic strategy charts", "Explore opening-hand recommendations for hard hands, soft hands and pairs. These charts use the trainer’s fixed rules; optimal strategy depends on the table rules."],
};

export function renderSeoPage(template, page) {
  const [title, description, heading, intro] = pages[page];
  return template
    .replaceAll(practiceTitle, title)
    .replaceAll(practiceDescription, description)
    .replaceAll(`${origin}/"`, `${origin}/${page}"`)
    .replace('<main id="gamePage">', '<main id="gamePage" hidden>')
    .replace('<main id="placeholderPages" hidden>', '<main id="placeholderPages">')
    .replace(`data-placeholder-content="${page}" hidden`, `data-placeholder-content="${page}"`)
    .replace(`>${page[0].toUpperCase() + page.slice(1)}</h1>`, `>${heading}</h1><p>${intro}</p>`)
    .replace(' data-placeholder-page="practice" aria-current="page"', ' data-placeholder-page="practice"')
    .replace(`data-placeholder-page="${page}"`, `data-placeholder-page="${page}" aria-current="page"`);
}

export function registerSeoRoutes(app, frontendRoot) {
  const template = readFileSync(`${frontendRoot}/index.html`, "utf8");
  for (const page of Object.keys(pages)) {
    app.get(`/${page}`, (req, res) => res.type("html").send(renderSeoPage(template, page)));
  }
  app.get("/robots.txt", (req, res) => res.sendFile(`${frontendRoot}/robots.txt`));
  app.get("/sitemap.xml", (req, res) => res.type("application/xml").sendFile(`${frontendRoot}/sitemap.xml`));
}
