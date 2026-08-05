const main = document.getElementById("button1");
const miniButtons = document.querySelectorAll(".mini-button");
main.addEventListener("click", () => {
    miniButtons.forEach((button) => {
        button.classList.toggle("show");
    });
});