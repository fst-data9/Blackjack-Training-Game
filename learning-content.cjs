const blackjackLearningContent = (() => {
    const content = {
        "sections": {
            "learn": {
                "title": "Learn",
                "indexHeading": "All blackjack lessons"
            },
            "glossary": {
                "title": "Glossary",
                "indexHeading": "All glossary terms"
            },
            "charts": {
                "title": "Charts",
                "indexHeading": "All strategy charts"
            }
        },
        "lessons": [
            {
                "number": "01",
                "slug": "meet-the-table",
                "title": "Meet the table",
                "body": "Get closer to 21 than the dealer without going over. Number cards keep their value, faces count as 10, and an ace counts as 1 or 11. You play against the dealer, not the other players.",
                "tip": "A + 7 = soft 18. Add a 9 and your ace becomes 1: now you have hard 17.",
                "related": ["glossary/ace", "glossary/blackjack", "glossary/bust", "glossary/soft-hand"]
            },
            {
                "number": "02",
                "slug": "your-five-moves",
                "title": "Your five moves",
                "body": "Hit takes another card. Stand keeps your total. Double adds an equal bet and gives exactly one more card. Split turns a matching pair into separate hands with separate bets. Late surrender returns half your original bet (rounded down here) after the dealer checks for blackjack.",
                "tip": "Double and split need enough bankroll. Surrender is available on your original two-card hand.",
                "related": ["glossary/hit", "glossary/stand", "glossary/double-down", "glossary/split", "glossary/late-surrender"]
            },
            {
                "number": "03",
                "slug": "read-the-dealer",
                "title": "Read the dealer",
                "body": "Basic strategy combines your hand with the dealer’s visible card. A dealer 4, 5 or 6 is vulnerable, but a bust is never guaranteed. Against a strong upcard you often need to improve your hand.",
                "tip": "Hard 12 stands against 4–6, but hits against 2 or 3. Small details matter.",
                "related": ["glossary/dealer-upcard", "glossary/hole-card", "glossary/basic-strategy", "charts/hard"]
            },
            {
                "number": "04",
                "slug": "soft-hands-and-pairs",
                "title": "Soft hands & pairs",
                "body": "A soft hand contains an ace still worth 11. That cushion creates good doubling opportunities. Pairs have their own strategy: splitting aces and eights is a useful starting point; keeping tens together protects a strong 20.",
                "tip": "This trainer allows up to four hands and doubling after splitting non-ace pairs. Split aces get one card each, with no hitting, doubling or re-splitting. A split ace plus a ten counts as 21 and pays 1:1 on a win.",
                "related": ["glossary/soft-hand", "glossary/split", "charts/soft", "charts/pair"]
            },
            {
                "number": "05",
                "slug": "think-in-decisions",
                "title": "Think in decisions",
                "body": "A correct decision can lose and a poor decision can win. Basic strategy aims to improve the average result over many hands; it cannot promise a profit. Treat the chips as practice and judge your choices, not your last result.",
                "tip": "Insurance is a separate bet on dealer blackjack. The trainer’s basic strategy declines it.",
                "related": ["glossary/basic-strategy", "glossary/house-edge", "glossary/insurance", "learn/read-the-dealer"]
            }
        ],
        "terms": [
            {
                "slug": "ace",
                "title": "Ace",
                "category": "Cards",
                "body": "A card worth 1 or 11. Its value adjusts to the highest total that does not bust.",
                "related": ["glossary/soft-hand", "glossary/hard-hand", "glossary/blackjack", "learn/meet-the-table"],
                "linkTerms": ["ace", "aces"]
            },
            {
                "slug": "bankroll",
                "title": "Bankroll",
                "category": "Table",
                "body": "The practice chips you have available. Splitting and doubling require additional chips.",
                "related": ["glossary/double-down", "glossary/split", "glossary/insurance", "learn/your-five-moves"],
                "linkTerms": ["bankroll"]
            },
            {
                "slug": "basic-strategy",
                "title": "Basic strategy",
                "category": "Strategy",
                "body": "A decision guide based on your hand, the dealer upcard and the table rules. It improves average results; it does not guarantee a win.",
                "related": ["learn/read-the-dealer", "learn/think-in-decisions", "charts/hard", "charts/soft", "charts/pair"],
                "linkTerms": ["basic strategy"]
            },
            {
                "slug": "blackjack",
                "title": "Blackjack",
                "category": "Cards",
                "body": "An ace plus a ten-value card in the original two-card hand. It pays 3:2 here. A 21 after splitting is not a natural blackjack.",
                "related": ["glossary/ace", "glossary/ten-value-card", "glossary/natural", "glossary/insurance"],
                "linkTerms": ["blackjack"]
            },
            {
                "slug": "bust",
                "title": "Bust",
                "category": "Cards",
                "body": "A hand total above 21. A player bust loses immediately, even if the dealer later busts.",
                "related": ["glossary/hit", "glossary/hard-hand", "glossary/soft-hand", "learn/meet-the-table"],
                "linkTerms": ["bust", "busts", "busting"]
            },
            {
                "slug": "dealer-upcard",
                "title": "Dealer upcard",
                "category": "Table",
                "body": "The dealer’s visible card. Use it with your own hand to choose a strategy move.",
                "related": ["glossary/hole-card", "glossary/basic-strategy", "glossary/insurance", "learn/read-the-dealer"],
                "linkTerms": ["dealer upcard", "upcard"]
            },
            {
                "slug": "double-down",
                "title": "Double down",
                "category": "Actions",
                "body": "Add an equal bet, take exactly one more card and finish that hand. Doubling after splitting non-ace pairs is allowed here.",
                "related": ["glossary/bankroll", "glossary/das", "glossary/soft-hand", "learn/your-five-moves"],
                "linkTerms": ["double down", "double", "doubling"]
            },
            {
                "slug": "das",
                "title": "DAS",
                "category": "Table",
                "body": "Double after split: a rule allowing you to double a two-card split hand. This trainer uses DAS for non-ace pairs.",
                "related": ["glossary/double-down", "glossary/split", "glossary/resplit", "charts/pair"],
                "linkTerms": ["DAS", "double after split", "doubling after splits"]
            },
            {
                "slug": "hard-hand",
                "title": "Hard hand",
                "category": "Cards",
                "body": "A hand with no ace counted as 11. A + 6 + 10 is hard 17 because the ace must count as 1.",
                "related": ["glossary/soft-hand", "glossary/ace", "charts/hard", "learn/meet-the-table"],
                "linkTerms": ["hard hand", "hard hands"]
            },
            {
                "slug": "hit",
                "title": "Hit",
                "category": "Actions",
                "body": "Ask for another card. You can keep hitting while your hand and the table rules allow it.",
                "related": ["glossary/bust", "glossary/stand", "glossary/double-down", "learn/your-five-moves"],
                "linkTerms": ["hit", "hitting"]
            },
            {
                "slug": "hole-card",
                "title": "Hole card",
                "category": "Table",
                "body": "The dealer’s face-down card. It is revealed when the dealer checks for blackjack or plays the hand.",
                "related": ["glossary/dealer-upcard", "glossary/blackjack", "glossary/insurance", "learn/read-the-dealer"],
                "linkTerms": ["hole card", "hole-card"]
            },
            {
                "slug": "house-edge",
                "title": "House edge",
                "category": "Strategy",
                "body": "The casino’s average advantage over many wagers under a specified rule set and playing strategy. Short sessions can vary widely.",
                "related": ["glossary/basic-strategy", "glossary/insurance", "learn/think-in-decisions"],
                "linkTerms": ["house edge"]
            },
            {
                "slug": "insurance",
                "title": "Insurance",
                "category": "Actions",
                "body": "A separate wager of half your original bet (rounded down to whole dollars here), offered against a dealer ace. It pays 2:1 if the dealer has blackjack. Basic strategy here declines it.",
                "related": ["glossary/blackjack", "glossary/dealer-upcard", "learn/read-the-dealer", "learn/think-in-decisions"],
                "linkTerms": ["insurance"]
            },
            {
                "slug": "late-surrender",
                "title": "Late surrender",
                "category": "Actions",
                "body": "Give up the original two-card hand for half your bet back, after the dealer checks for blackjack. It is not available on split hands here.",
                "related": ["glossary/bankroll", "glossary/basic-strategy", "charts/hard", "learn/your-five-moves"],
                "linkTerms": ["late surrender", "surrender"]
            },
            {
                "slug": "natural",
                "title": "Natural",
                "category": "Cards",
                "body": "Another name for an original two-card blackjack.",
                "related": ["glossary/blackjack", "glossary/ace", "glossary/ten-value-card", "glossary/push"],
                "linkTerms": ["natural", "natural blackjack"]
            },
            {
                "slug": "push",
                "title": "Push",
                "category": "Table",
                "body": "A tie: the original wager is returned. An ordinary 21 does not tie a dealer natural blackjack.",
                "related": ["glossary/blackjack", "glossary/natural", "glossary/bankroll", "learn/meet-the-table"],
                "linkTerms": ["push"]
            },
            {
                "slug": "resplit",
                "title": "Resplit",
                "category": "Actions",
                "body": "Split a newly dealt matching pair again. This trainer permits a maximum of four hands, but split aces cannot be re-split.",
                "related": ["glossary/split", "glossary/das", "charts/pair", "learn/soft-hands-and-pairs"],
                "linkTerms": ["resplit", "re-split", "re-splitting"]
            },
            {
                "slug": "s17",
                "title": "S17",
                "category": "Table",
                "body": "Stand on soft 17. The dealer stands on A + 6 in this trainer; H17 tables instead require a hit.",
                "related": ["glossary/soft-hand", "glossary/ace", "charts/soft", "learn/read-the-dealer"],
                "linkTerms": ["S17", "soft 17"]
            },
            {
                "slug": "shoe",
                "title": "Shoe",
                "category": "Table",
                "body": "The combined decks used for dealing. The trainer lets you choose 1, 2, 3, 4, 6 or 8 decks.",
                "related": ["glossary/basic-strategy", "glossary/house-edge", "learn/meet-the-table"],
                "linkTerms": ["shoe"]
            },
            {
                "slug": "soft-hand",
                "title": "Soft hand",
                "category": "Cards",
                "body": "A hand with an ace counted as 11. A + 6 is soft 17; the ace can switch to 1 if another card would otherwise bust the hand.",
                "related": ["glossary/hard-hand", "glossary/ace", "charts/soft", "learn/soft-hands-and-pairs"],
                "linkTerms": ["soft hand", "soft hands"]
            },
            {
                "slug": "split",
                "title": "Split",
                "category": "Actions",
                "body": "Separate a matching pair into two hands with equal bets. Split aces get exactly one more card each, with no hitting, doubling or re-splitting. A split ace plus a ten counts as 21 and pays 1:1 on a win.",
                "related": ["glossary/resplit", "glossary/das", "charts/pair", "learn/soft-hands-and-pairs"],
                "linkTerms": ["split", "splitting"]
            },
            {
                "slug": "stand",
                "title": "Stand",
                "category": "Actions",
                "body": "Keep your current total and finish your turn on that hand.",
                "related": ["glossary/hit", "glossary/s17", "charts/hard", "learn/your-five-moves"],
                "linkTerms": ["stand", "standing"]
            },
            {
                "slug": "ten-value-card",
                "title": "Ten-value card",
                "category": "Cards",
                "body": "A 10, jack, queen or king. All count as 10.",
                "related": ["glossary/blackjack", "glossary/natural", "glossary/ace", "charts/pair"],
                "linkTerms": ["ten-value card", "ten-value cards"]
            }
        ],
        "charts": [
            {
                "slug": "hard",
                "title": "Hard totals",
                "body": "A hard hand has no ace counted as 11. Hard 12 stands against dealer 4–6, but hits against 2 or 3. Hard 13 stands against 2–6. On an original two-card hard 16 against 10, surrender if available; otherwise hit.",
                "tip": "Dealer stands on soft 17. Doubling after splitting non-ace pairs and late surrender on the original hand are available. These are fixed trainer recommendations; deck count and casino rules can change optimal strategy. Basic strategy does not guarantee profit.",
                "related": ["glossary/hard-hand", "glossary/late-surrender", "glossary/dealer-upcard", "learn/read-the-dealer"]
            },
            {
                "slug": "soft",
                "title": "Soft totals",
                "body": "A soft hand contains an ace worth 11. Soft 18 doubles against 3–6 when affordable, otherwise stands. Against 9, 10 or ace it hits. The ace can become 1 as cards are drawn.",
                "tip": "Dealer stands on soft 17. Doubling after splitting non-ace pairs and late surrender on the original hand are available. These are fixed trainer recommendations; deck count and casino rules can change optimal strategy. Basic strategy does not guarantee profit.",
                "related": ["glossary/soft-hand", "glossary/ace", "glossary/double-down", "learn/soft-hands-and-pairs"]
            },
            {
                "slug": "pair",
                "title": "Pairs",
                "body": "Consider pair strategy before hard totals. Split aces and eights when affordable; keep tens together. Play fives as hard 10. This trainer permits up to four hands for non-ace pairs. Split aces receive one card each, with no hitting, doubling or re-splitting; a split ace plus a ten counts as 21 and pays 1:1 on a win.",
                "tip": "Dealer stands on soft 17. Doubling after splitting non-ace pairs and late surrender on the original hand are available. These are fixed trainer recommendations; deck count and casino rules can change optimal strategy. Basic strategy does not guarantee profit.",
                "related": ["glossary/split", "glossary/resplit", "glossary/das", "learn/soft-hands-and-pairs"]
            }
        ]
    };

    content.topics = {};
    for (const [section, entries] of [['learn', content.lessons], ['glossary', content.terms], ['charts', content.charts]]) {
        for (const topic of entries) {
            topic.path = `${section}/${topic.slug}`;
            content.topics[topic.path] = topic;
        }
    }

    const phrases = content.terms.flatMap(term => term.linkTerms.map(phrase => ({
        phrase: phrase.toLowerCase(), path: `glossary/${term.slug}`
    }))).sort((a, b) => b.phrase.length - a.phrase.length);
    const phrasePattern = phrases.map(({ phrase }) => phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const matcher = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${phrasePattern})(?![\\p{L}\\p{N}_])`, 'giu');

    content.createLinkState = (currentTopic = '', limit = 5, seen = new Set()) => ({ currentTopic, remaining: limit, seen });
    // Return plain text/link parts. A shared state spans paragraphs and cards
    // so alternate phrases for the same term only link its first mention.
    content.linkify = (text, state = content.createLinkState()) => {
        const parts = [];
        let start = 0;
        for (const occurrence of text.matchAll(matcher)) {
            const index = occurrence.index;
            const match = phrases.find(({ phrase }) => phrase === occurrence[0].toLowerCase());
            if (match.path === state.currentTopic || state.seen.has(match.path)) {
                continue;
            }
            state.seen.add(match.path);
            // A mention beyond this card's cap stays plain on later cards too.
            if (state.remaining <= 0) continue;
            if (index > start) parts.push({ text: text.slice(start, index) });
            parts.push({ text: occurrence[0], href: `/${match.path}` });
            state.remaining--;
            start = index + occurrence[0].length;
        }
        if (start < text.length) parts.push({ text: text.slice(start) });
        return parts;
    };

    content.topicTip = topic => topic.tip || `Category: ${topic.category}. Explore related terms in the glossary and practise decisions at the table.`;
    content.createPageLinkState = path => {
        const topic = content.topics[path];
        const state = content.createLinkState(path, topic ? 5 : Infinity);
        if (topic) {
            content.linkify(topic.body, state);
            content.linkify(content.topicTip(topic), state);
        }
        return state;
    };
    content.breadcrumbs = path => {
        const section = path.split('/')[0];
        const crumbs = [{ title: 'Home', href: '/' }, { title: content.sections[section].title, href: `/${section}` }];
        if (content.topics[path]) crumbs.push({ title: content.topics[path].title, href: `/${path}` });
        return crumbs;
    };
    return content;
})();
if (typeof module !== "undefined") module.exports = blackjackLearningContent;
