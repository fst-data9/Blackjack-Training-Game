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

    navButtons.forEach((button) => {
        if (button.dataset.placeholderPage === pageName) {
            button.setAttribute("aria-current", "page");
        } else {
            button.removeAttribute("aria-current");
        }
    });
}

navButtons.forEach((button) => {
    button.addEventListener("click", () => showSitePage(button.dataset.placeholderPage));
});

document.getElementById("startTrainingBtn")?.addEventListener("click", () => {
    document.getElementById("newGameBtn")?.click();
});
