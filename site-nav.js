const navButtons = [...document.querySelectorAll("[data-placeholder-page]")];
const gamePage = document.getElementById("gamePage");
const reviewPage = document.getElementById("reviewPage");
const placeholderPages = document.getElementById("placeholderPages");

function showSitePage(pageName) {
    const isPractice = pageName === "practice";

    gamePage.hidden = !isPractice;
    reviewPage.hidden = true;
    placeholderPages.hidden = isPractice;

    document.querySelectorAll("[data-placeholder-content]").forEach((page) => {
        page.hidden = page.dataset.placeholderContent !== pageName;
    });

    document.getElementById(`${pageName}Heading`)?.focus();

    navButtons.forEach((button) => {
        if (button.dataset.placeholderPage === pageName) {
            button.setAttribute("aria-current", "page");
        } else {
            button.removeAttribute("aria-current");
        }
    });
}

navButtons.filter((button) => button.tagName === "BUTTON").forEach((button) => {
    button.addEventListener("click", () => showSitePage(button.dataset.placeholderPage));
});

document.getElementById("startTrainingBtn")?.addEventListener("click", () => {
    document.getElementById("newGameBtn")?.click();
});

const initialPage = location.pathname.split("/")[1];
if (["learn", "glossary", "charts", "privacy", "simulation", "strategies"].includes(initialPage)) showSitePage(initialPage);

// Keep an active training round while giving each public view a crawlable URL.
async function navigatePublicPage(path, push = true) {
    try {
        const url = new URL(path, location.href);
        const pagePath = url.pathname;
        const response = await fetch(path);
        if (!response.ok) throw new Error("Page unavailable");
        const html = new DOMParser().parseFromString(await response.text(), "text/html");
        if (push) history.pushState(null, "", path);
        document.title = html.title;
        for (const selector of ['meta[name="description"]', 'link[rel="canonical"]', 'meta[property="og:title"]', 'meta[property="og:description"]', 'meta[property="og:url"]']) {
            const source = html.querySelector(selector);
            const target = document.querySelector(selector);
            const attribute = selector.startsWith('link') ? 'href' : 'content';
            target.setAttribute(attribute, source.getAttribute(attribute));
        }
        const section = pagePath.split("/")[1] || "practice";
        document.querySelectorAll('.topic-view, .topic-index, [data-related-topics], .breadcrumbs, #breadcrumbData, .learning-intro').forEach(view => view.remove());
        const sourceBreadcrumbs = html.querySelector('.breadcrumbs');
        if (sourceBreadcrumbs) document.getElementById(`${section}Heading`).before(sourceBreadcrumbs);
        const sourceBreadcrumbData = html.getElementById('breadcrumbData');
        if (sourceBreadcrumbData) document.head.append(sourceBreadcrumbData);
        const sourceView = html.querySelector('.topic-view');
        if (sourceView) document.getElementById(`${section}Content`).before(sourceView);
        const sourceEnd = html.querySelector('.topic-index, [data-related-topics]');
        if (sourceEnd) document.getElementById(`${section}Content`).after(sourceEnd);
        const sourceHeading = html.getElementById(`${section}Heading`);
        if (sourceHeading) document.getElementById(`${section}Heading`).textContent = sourceHeading.textContent;
        const sourceIntro = html.querySelector('.learning-intro');
        if (sourceIntro) document.getElementById(`${section}Heading`).after(sourceIntro);
        if (section === "charts" && pagePath.split("/")[2]) {
            document.getElementById("chartType").value = pagePath.split("/")[2];
            document.getElementById("chartType").dispatchEvent(new Event("change"));
        }
        if (section === "strategies") document.getElementById("strategiesContent").innerHTML = html.getElementById("strategiesContent").innerHTML;
        showSitePage(section);
        if (url.hash) document.getElementById(url.hash.slice(1))?.scrollIntoView();
        window.dispatchEvent(new Event("publicpagechange"));
    } catch {
        location.assign(path);
    }
}
document.addEventListener("click", event => {
    if (event.defaultPrevented) return;
    const link = event.target.closest('a');
    if (!link || !/^\/(?:$|privacy(?:#cookie-settings)?$|(?:learn|glossary|charts|simulation|strategies)(?:\/[a-z0-9-]+)?$)/.test(link.getAttribute("href") || "")) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigatePublicPage(link.getAttribute("href"));
});
window.addEventListener("popstate", () => navigatePublicPage(location.pathname + location.hash, false));
