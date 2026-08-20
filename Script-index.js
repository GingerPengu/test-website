const buttons = document.querySelectorAll(".indexSelect");
const welcomeScreen = document.getElementById("welcome-screen");
const programFrame = document.getElementById("program-frame");
buttons.forEach(button => {
    button.addEventListener("click", () => {
        const program = button.dataset.program;
        openProgram(program);
    });
});
function openProgram(program) {
    welcomeScreen.style.display = "none";
    programFrame.style.display = "block";
    programFrame.src = `programs/${program}`;
}